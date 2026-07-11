const {
  OrderDB, KotDB, TableDB,
  MenuDB, SyncDB, SettingsDB, OutletDB, CustomerDB
} = require('../database/localDB')
const { app, BrowserWindow } = require('electron')

// We will use the production backend URL for Sync, ideally configurable via setting or env
const API_URL = 'https://petpooja-saas.onrender.com/api'

// Exponential backoff schedule for failed sync cycles (ms): 30s → 60s → 120s, capped at 300s
const RETRY_BASE_MS = 30 * 1000
const RETRY_CAP_MS = 5 * 60 * 1000

class SyncEngine {
  constructor() {
    this.isOnline = false
    this.isSyncing = false
    this.syncInterval = null
    this.lastSync = null
    this.consecutiveFailures = 0
    this.retryTimer = null
  }

  setOnlineStatus(online) {
    this.isOnline = online
    if (online) {
      // Trigger sync when coming online
      this.syncAll()
    }
  }

  notifyRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }

  /**
   * Every sync-status notification carries `pending` (count of local orders
   * not yet uploaded) so the renderer status bar can show
   * "N orders pending sync" at all times.
   */
  notifySyncStatus(status, message, extra = {}) {
    let pending = 0
    try { pending = OrderDB.getUnsyncedCount() } catch (_) { /* db not ready */ }
    this.notifyRenderer('sync-status', { status, message, pending, ...extra })
  }

  // ─────────────────────────────
  // DOWNLOAD FROM CLOUD
  // Called on app start + hourly
  // ─────────────────────────────
  /**
   * Pulls menu, tables, outlet, customers and staff into the local cache.
   * @param {string} outletId
   * @returns {boolean} false if the cycle errored (used for retry backoff)
   */
  async downloadFromCloud(outletId) {
    if (!this.isOnline) return true
    // No token → not logged in → do not sync. Skip the whole cycle (no fetch)
    // and report success so this no-op never trips the retry backoff.
    if (!this.hasAuth()) return true

    try {
      this.notifySyncStatus('downloading', 'Updating menu from cloud...')

      // Each step gets its OWN try/catch: one cosmetic failure (a mis-shaped
      // row, a 500 on one endpoint) must not fail the whole cycle or block
      // last_sync from advancing.

      // Download menu — categories and items live on separate endpoints
      try {
        const [catRes, itemsRes] = await Promise.all([
          fetch(
            `${API_URL}/menu/categories?outlet_id=${outletId}`,
            { headers: this.getHeaders() }
          ),
          fetch(
            `${API_URL}/menu/items?outlet_id=${outletId}&limit=5000`,
            { headers: this.getHeaders() }
          ),
        ])

        let categories = []
        let items = []
        if (catRes.ok) {
          const body = await catRes.json()
          categories = body.data?.categories || body.data?.data || body.data || []
        }
        if (itemsRes.ok) {
          const body = await itemsRes.json()
          items = body.data?.items || body.data?.data || body.data || []
        }
        if (!Array.isArray(categories)) categories = []
        if (!Array.isArray(items)) items = []
        if (categories.length || items.length) {
          MenuDB.saveMenuFromSync(categories, items)
        }
      } catch (e) { console.error('Menu sync step failed:', e) }

      // Download tables
      try {
        const tablesRes = await fetch(
          `${API_URL}/orders/tables?outlet_id=${outletId}`,
          { headers: this.getHeaders() }
        )
        if (tablesRes.ok) {
          const body = await tablesRes.json()
          const tables = body.data?.tables || body.data?.data || body.data || []
          if (Array.isArray(tables)) TableDB.saveFromSync(tables)
        }
      } catch (e) { console.error('Tables sync step failed:', e) }

      // Download outlet info (for offline bill header + region/tax config).
      // OutletDB.save handles head_office fallbacks internally.
      try {
        const outletRes = await fetch(
          `${API_URL}/auth/me`,
          { headers: this.getHeaders() }
        )
        if (outletRes.ok) {
          const me = await outletRes.json()
          const user = me.data?.user || {}
          const outlet = me.data?.outlet
            || me.data?.outlets?.[0]
            || user.outlet
            || user.outlets?.[0]
          if (outlet) OutletDB.save(outlet)
        }
      } catch (_) {}

      // Download customers cache (for offline lookup/attach at the POS)
      try {
        const custRes = await fetch(
          `${API_URL}/customers?outlet_id=${outletId}&limit=500`,
          { headers: this.getHeaders() }
        )
        if (custRes.ok) {
          const body = await custRes.json()
          const customers = body.data?.data || body.data || []
          if (Array.isArray(customers)) CustomerDB.saveFromSync(customers)
        }
      } catch (_) {}

      // Download staff (for offline PIN verify)
      try {
        const staffRes = await fetch(
          `${API_URL}/staff?outlet_id=${outletId}&limit=100`,
          { headers: this.getHeaders() }
        )
        if (staffRes.ok) {
          const staff = await staffRes.json()
          this.saveStaffLocally(staff.data?.data || staff.data || [])
        }
      } catch (e) { console.error('Staff sync step failed:', e) }

      SettingsDB.set('last_sync', new Date().toISOString())

      this.notifySyncStatus('success', 'Data synced successfully')
      return true

    } catch (err) {
      console.error('Download sync failed:', err)
      this.notifySyncStatus('error', 'Sync failed — working offline')
      return false
    }
  }

  // ─────────────────────────────
  // UPLOAD TO CLOUD
  // Called when online detected
  // ─────────────────────────────
  /**
   * Flattens a local order row + its items into the /orders/sync v2 contract
   * shape. Prices are sent as stored at sale time — the backend never
   * re-derives them from the menu.
   * @param {object} order - Row from OrderDB.getUnsyncedOrders()
   * @returns {object}
   */
  toSyncPayload(order) {
    const full = OrderDB.getById(order.id)
    const items = (full?.items || []).map(it => ({
      // Local order_items.id (uuid) — the per-item idempotency key. The backend
      // creates each OrderItem WITH this id (new-order path) and, on an 'exists'
      // replay, inserts only items whose id it hasn't seen. That makes item sync
      // idempotent across retries: a lost 2xx no longer duplicates items.
      id: it.id,
      menu_item_id: it.menu_item_id || undefined,
      item_name: it.menu_item_name,
      variant_id: it.variant_id || undefined,
      variant_name: it.variant_name || undefined,
      quantity: it.quantity,
      unit_price: it.unit_price,
      addon_total: it.addon_total || 0,
      total_price: it.line_total,
      notes: it.notes || undefined,
    }))

    // Only send customer_id once that local customer row is itself synced (its
    // id is then the cloud id). Otherwise send name/phone and let the backend
    // find-or-create by phone — avoids an order FK failure on an unsynced id.
    let customerId
    if (order.customer_id) {
      try {
        const cust = CustomerDB.getById(order.customer_id)
        if (cust && cust.synced === 1) customerId = order.customer_id
      } catch (_) { /* fall back to name/phone */ }
    }

    return {
      id: order.id, // client UUID — backend idempotency key
      outlet_id: order.outlet_id,
      order_number: order.order_number, // offline device number
      order_type: order.order_type || 'dine_in',
      table_id: order.table_id || undefined,
      table_number: order.table_number || undefined,
      source: 'pos',
      status: order.status,
      customer_id: customerId,
      customer_name: order.customer_name || undefined,
      customer_phone: order.customer_phone || undefined,
      covers: order.covers || undefined,
      notes: order.notes || undefined,
      subtotal: order.subtotal,
      tax_amount: order.tax_amount,
      cgst_amount: order.cgst_amount,
      sgst_amount: order.sgst_amount,
      discount_amount: order.discount_amount,
      discount_type: order.discount_type || undefined,
      discount_value: order.discount_value != null ? order.discount_value : undefined,
      round_off: order.round_off != null ? order.round_off : undefined,
      service_charge: order.service_charge || undefined,
      total_amount: order.total_amount,
      payment_method: order.payment_method || undefined,
      payment_note: order.payment_note || undefined,
      invoice_number: order.invoice_number || undefined,
      created_at: order.created_at,
      billed_at: order.billed_at || undefined,
      paid_at: order.paid_at || undefined,
      items,
    }
  }

  /**
   * Uploads all unsynced orders in ONE batch request per cycle:
   *   POST /orders/sync  { orders: [...] }
   *
   * Response handling is refined by HTTP status so a single poison order can
   * never dead-letter the whole batch, and a transient transport blip never
   * burns a dead-letter attempt:
   *   200      — authoritative per-order results ('synced'/'exists'/'failed',
   *              plus an optional 'table_occupied' keep-both flag). A per-order
   *              'failed' is a PERMANENT candidate → markSyncPermanentFailure
   *              (increments sync_attempts).
   *   400/422  — whole batch rejected on validation. Fall back to PER-ORDER
   *              POSTs; the order that still 400/422s alone is the offender →
   *              markSyncPermanentFailure. The rest sync normally.
   *   401      — token problem → transient. No attempts increment, no
   *              dead-letter; status 'error' and backoff retry (the renderer's
   *              auth refresh pushes a fresh token).
   *   404/5xx/network — transient transport → markSyncError WITHOUT
   *              incrementing attempts; backoff retry.
   * NEVER feed a batch-level response into resolveConflict().
   * @returns {{ ok: boolean, synced: number, failed: number }}
   */
  async uploadPendingOrders() {
    if (!this.isOnline || this.isSyncing) return { ok: true, synced: 0, failed: 0 }

    // No token → not logged in → do not sync. Skip the whole cycle: no fetch,
    // no markSyncError, no attempts increment.
    if (!this.hasAuth()) return { ok: true, synced: 0, failed: 0 }

    this.isSyncing = true
    const conflicts = []
    let ok = true
    let synced = 0
    let failed = 0
    let authError = false
    let unsyncedOrders = []

    try {
      unsyncedOrders = OrderDB.getUnsyncedOrders()

      if (unsyncedOrders.length === 0) {
        this.notifySyncStatus('idle', 'All orders synced')
        return { ok: true, synced: 0, failed: 0 }
      }

      this.notifySyncStatus('uploading', `Syncing ${unsyncedOrders.length} orders...`)

      const byId = new Map(unsyncedOrders.map(o => [o.id, o]))

      const res = await fetch(`${API_URL}/orders/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getHeaders()
        },
        body: JSON.stringify({
          orders: unsyncedOrders.map(o => this.toSyncPayload(o))
        })
      })

      if (res.ok) {
        // 200 — authoritative per-order results.
        const body = await res.json()
        const results = body.data?.results || []
        const r = this.applyOrderResults(results, byId, conflicts)
        synced += r.synced
        failed += r.failed
      } else if (res.status === 400 || res.status === 422) {
        // Permanent validation rejection of the WHOLE batch. One poison order
        // must not dead-letter the rest — re-send each alone; the one that
        // still 400/422s is the offender, the rest sync normally.
        const r = await this.retryOrdersIndividually(unsyncedOrders, conflicts)
        synced += r.synced
        failed += r.failed
        if (r.failed > 0 || r.transient > 0) ok = false
      } else if (res.status === 401) {
        // Token problem — transient. Do NOT increment attempts or dead-letter.
        // The renderer's auth refresh pushes a fresh token; backoff retries.
        ok = false
        authError = true
      } else {
        // 404 / 5xx / other transport error — transient. Record the error on
        // each order WITHOUT incrementing attempts; backoff retries the batch.
        // NEVER feed a batch-level response into resolveConflict().
        ok = false
        for (const order of unsyncedOrders) {
          OrderDB.markSyncError(order.id, `batch_sync_failed_http_${res.status}`)
        }
      }
    } catch (err) {
      // Network throw — transient transport. Record on each order WITHOUT
      // incrementing attempts so backoff retries the whole batch.
      ok = false
      console.error('Upload sync failed:', err)
      for (const order of unsyncedOrders) {
        try { OrderDB.markSyncError(order.id, `network_error: ${err.message || 'unknown'}`) } catch (_) {}
      }
    } finally {
      this.isSyncing = false
      this.lastSync = new Date()

      if (failed > 0) ok = false

      this.notifySyncStatus(
        ok ? 'done' : 'error',
        authError ? 'Sync paused — reauthenticating...' : `Synced: ${synced}, Failed: ${failed}`,
        { synced, failed }
      )

      if (conflicts.length > 0) {
        this.notifyRenderer('sync-conflicts', { conflicts })
      }
    }

    return { ok, synced, failed }
  }

  /**
   * Applies a 200 batch's per-order results to local state.
   *   'synced'/'exists' → markSynced (+ table_occupied conflict audit)
   *   'failed'          → markSyncPermanentFailure (dead-letter candidate)
   * @param {object[]} results - body.data.results rows
   * @param {Map<string,object>} byId - local order rows keyed by id
   * @param {object[]} conflicts - accumulator for the renderer notification
   * @returns {{ synced: number, failed: number }}
   */
  applyOrderResults(results, byId, conflicts) {
    let synced = 0
    let failed = 0

    for (const result of results) {
      const local = byId.get(result.id)

      if (result.status === 'synced' || result.status === 'exists') {
        OrderDB.markSynced(result.id, result.order_number || null)
        synced++

        if (result.conflict === 'table_occupied') {
          SyncDB.logConflict({
            outlet_id: local?.outlet_id,
            table_name: 'orders',
            record_id: result.id,
            conflict_type: 'table_occupied',
            resolution: 'kept_both_cloud_flagged',
            payload: {
              offline_number: local?.order_number,
              cloud_number: result.order_number,
            },
          })
          conflicts.push({ orderId: result.id, resolution: 'kept_both_cloud_flagged' })
        }
      } else if (result.status === 'failed') {
        // A per-order 'failed' from a 200 batch is a candidate PERMANENT
        // failure → dead-letter path (increments sync_attempts).
        failed++
        OrderDB.markSyncPermanentFailure(result.id, result.error || 'sync_failed')
      }
    }

    return { synced, failed }
  }

  /**
   * Fallback for a 400/422 batch rejection: re-POST each order on its own so a
   * single invalid order can't sink the batch. An order that still 400/422s
   * alone is permanently rejected (dead-letter); transport/auth blips stay
   * transient (no attempts increment) and are left for the backoff retry.
   * Batches are <= 50, so a simple loop is fine.
   * @param {object[]} orders
   * @param {object[]} conflicts
   * @returns {{ synced: number, failed: number, transient: number }}
   */
  async retryOrdersIndividually(orders, conflicts) {
    let synced = 0
    let failed = 0       // permanently rejected this pass (dead-lettered)
    let transient = 0    // transient errors — keep for the backoff retry

    for (const order of orders) {
      try {
        const res = await fetch(`${API_URL}/orders/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders()
          },
          body: JSON.stringify({ orders: [this.toSyncPayload(order)] })
        })

        if (res.ok) {
          const body = await res.json().catch(() => null)
          const results = body?.data?.results || []
          const r = this.applyOrderResults(results, new Map([[order.id, order]]), conflicts)
          synced += r.synced
          failed += r.failed
          if (results.length === 0) {
            // 200 but no result row for this order — treat as transient.
            transient++
            OrderDB.markSyncError(order.id, 'sync_no_result')
          }
        } else if (res.status === 400 || res.status === 422) {
          // This specific order is the offender → permanent (dead-letter).
          failed++
          OrderDB.markSyncPermanentFailure(order.id, `validation_rejected_http_${res.status}`)
        } else {
          // 401 / 404 / 5xx for this order — transient, no attempts increment.
          transient++
          OrderDB.markSyncError(order.id, `sync_failed_http_${res.status}`)
        }
      } catch (err) {
        transient++
        OrderDB.markSyncError(order.id, `network_error: ${err.message || 'unknown'}`)
      }
    }

    return { synced, failed, transient }
  }

  // ─────────────────────────────
  // UPLOAD PENDING CUSTOMERS
  // Walk-ins created offline
  // ─────────────────────────────
  /**
   * Uploads customers created locally while offline. The backend
   * find-or-creates by phone, so 409 (already exists) counts as success.
   */
  async uploadPendingCustomers() {
    if (!this.isOnline) return

    let rows = []
    try {
      rows = CustomerDB.getUnsynced()
    } catch (err) {
      console.error('Customer sync: failed to read unsynced rows:', err)
      return
    }

    for (const customer of rows) {
      try {
        const res = await fetch(`${API_URL}/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders()
          },
          body: JSON.stringify({
            outlet_id: customer.outlet_id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
          })
        })

        if (res.ok || res.status === 409) {
          // Read the server-allocated id and remap the local UUID → cloud id,
          // repointing any orders that reference this customer so their FK
          // resolves on upload. If the response carries no id (e.g. plain 409),
          // remapId falls back to a simple markSynced — the backend resolves
          // the order's customer by phone.
          let cloudId = null
          try {
            const body = await res.json()
            cloudId = body?.data?.id || body?.data?.customer?.id || body?.id || null
          } catch (_) { /* no/invalid body — treat as markSynced */ }
          CustomerDB.remapId(customer.id, cloudId)
        }
      } catch (err) {
        console.error(`Failed to sync customer ${customer.id}:`, err)
      }
    }
  }

  // ─────────────────────────────
  // CONFLICT RESOLUTION
  // Handles non-2xx sync responses
  // ─────────────────────────────
  /**
   * Resolves a sync conflict for a single order.
   *
   * NOTE: The v2 batch endpoint returns 200 with per-order results, so this
   * is only reached on legacy transport-level failures of the whole request.
   *
   * Rules:
   *   404 — Order was deleted on cloud (e.g. cancelled by manager online
   *         while POS was offline). Cloud wins: mark local as cancelled
   *         and synced so we stop retrying.
   *
   *   409 — Order exists on cloud but data conflicts (e.g. same order
   *         was modified on both sides). Strategy: cloud wins for status
   *         changes (paid/cancelled), offline wins for new item additions.
   *         We fetch the cloud copy and merge items before re-uploading.
   *
   *   Other — Transient server error. Leave unsynced so the next cycle
   *           retries it naturally (max 3 attempts via SyncDB queue).
   *
   * @param {object} order - Local unsynced order row
   * @param {Response} res - The failed fetch Response
   * @returns {string|null} Resolution description, or null if unresolved
   */
  async resolveConflict(order, res) {
    if (res.status === 404) {
      const cancelledAt = new Date().toISOString()
      OrderDB.applyConflictResolution(order.id, 'cancelled', {
        cancelled_at: cancelledAt,
        cancellation_reason: 'sync_conflict_deleted_on_cloud',
      })
      if (order.table_id) {
        TableDB.updateStatus(order.table_id, 'available')
      }
      SyncDB.logConflict({
        outlet_id: order.outlet_id,
        table_name: 'orders',
        record_id: order.id,
        conflict_type: 'cloud_deleted',
        cloud_status: 'deleted',
        local_status: order.status,
        resolution: 'cloud_deleted_order_cancelled_locally',
        payload: {
          order_number: order.order_number,
          local_updated_at: order.updated_at,
          resolved_at: cancelledAt,
        },
      })
      console.log(`[SyncEngine] Conflict resolved (404): order ${order.id} cancelled — deleted on cloud.`)
      return 'cloud_deleted_order_cancelled_locally'
    }

    if (res.status === 409) {
      try {
        // Fetch the authoritative cloud copy
        const cloudRes = await fetch(`${API_URL}/orders/${order.id}`, {
          headers: this.getHeaders()
        })

        if (!cloudRes.ok) return null

        const { data: cloudOrder } = await cloudRes.json()

        // Cloud wins for terminal statuses (paid, cancelled) — do not overwrite
        if (['paid', 'cancelled', 'completed'].includes(cloudOrder.status)) {
          OrderDB.applyConflictResolution(order.id, cloudOrder.status, {
            paid_at: cloudOrder.paid_at,
            billed_at: cloudOrder.billed_at,
            payment_method: cloudOrder.payment_method,
            invoice_number: cloudOrder.invoice_number,
            cancelled_at: cloudOrder.cancelled_at,
            cancellation_reason: cloudOrder.cancellation_reason || 'sync_conflict_cloud_terminal_status',
          })
          if (order.table_id) {
            TableDB.updateStatus(order.table_id, 'available')
          }
          SyncDB.logConflict({
            outlet_id: order.outlet_id,
            table_name: 'orders',
            record_id: order.id,
            conflict_type: 'cloud_terminal_status',
            cloud_status: cloudOrder.status,
            local_status: order.status,
            resolution: `cloud_status_applied:${cloudOrder.status}`,
            payload: {
              order_number: order.order_number,
              cloud_updated_at: cloudOrder.updated_at,
              local_updated_at: order.updated_at,
            },
          })
          console.log(`[SyncEngine] Conflict resolved (409): order ${order.id} — cloud status '${cloudOrder.status}' applied locally.`)
          return `cloud_status_applied:${cloudOrder.status}`
        }

        // Cloud order is still active — re-upload as a single-order batch.
        // The endpoint is idempotent on the client id ('exists' on replay).
        const payload = this.toSyncPayload(order)
        const mergeRes = await fetch(`${API_URL}/orders/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders()
          },
          body: JSON.stringify({ orders: [payload] })
        })

        if (mergeRes.ok) {
          const body = await mergeRes.json().catch(() => null)
          const result = body?.data?.results?.[0]
          if (result && (result.status === 'synced' || result.status === 'exists')) {
            OrderDB.markSynced(order.id, result.order_number || null)
            SyncDB.logConflict({
              outlet_id: order.outlet_id,
              table_name: 'orders',
              record_id: order.id,
              conflict_type: 'active_order_merge',
              cloud_status: cloudOrder.status,
              local_status: order.status,
              resolution: 'items_merged',
              payload: {
                order_number: order.order_number,
                cloud_number: result.order_number,
                item_count: payload.items.length,
                cloud_updated_at: cloudOrder.updated_at,
                local_updated_at: order.updated_at,
              },
            })
            console.log(`[SyncEngine] Conflict resolved (409): order ${order.id} — items merged.`)
            return 'items_merged'
          }
        }
      } catch (err) {
        console.error(`[SyncEngine] Conflict resolution failed for order ${order.id}:`, err)
      }
    }

    return null
  }

  // ─────────────────────────────
  // FULL SYNC
  // ─────────────────────────────
  async syncAll(outletId) {
    if (!this.isOnline) return
    // No token → not logged in → do not sync. Skip the entire cycle before any
    // upload/download fires; no fetch, no markSyncError, no attempts increment,
    // and no retry scheduled (there is nothing to retry until login).
    if (!this.hasAuth()) return

    let cycleOk = true

    try {
      // We get outlet_id dynamically from Settings to allow full background sync without args
      const currentOutletId = outletId || SettingsDB.get('outlet_id')

      await this.uploadPendingCustomers()

      const upload = await this.uploadPendingOrders()
      if (upload && upload.ok === false) cycleOk = false

      if (currentOutletId) {
        const downloaded = await this.downloadFromCloud(currentOutletId)
        if (downloaded === false) cycleOk = false
      }
    } catch (err) {
      cycleOk = false
      console.error('Full sync failed:', err)
      this.notifySyncStatus('error', 'Sync failed — working offline')
    }

    if (cycleOk) {
      this.consecutiveFailures = 0
      this.clearRetryTimer()
    } else {
      this.consecutiveFailures++
      this.scheduleRetry(outletId)
    }
  }

  // ─────────────────────────────
  // RETRY / BACKOFF
  // ─────────────────────────────
  clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  /**
   * Schedules a one-off retry after a failed sync cycle with exponential
   * backoff: 30s, 60s, 120s, ... capped at 300s. Any previously scheduled
   * retry is cleared first so timers never stack up.
   * @param {string} [outletId]
   */
  scheduleRetry(outletId) {
    this.clearRetryTimer()

    const delay = Math.min(
      RETRY_BASE_MS * Math.pow(2, Math.max(0, this.consecutiveFailures - 1)),
      RETRY_CAP_MS
    )

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.isOnline) {
        this.syncAll(outletId)
      }
    }, delay)

    this.notifySyncStatus(
      'retry-scheduled',
      `Sync failed — retrying in ${Math.round(delay / 1000)}s`,
      { retry_in_ms: delay, consecutive_failures: this.consecutiveFailures }
    )
  }

  // ─────────────────────────────
  // START AUTO SYNC
  // ─────────────────────────────
  startAutoSync(outletId) {
    // Sync every 5 minutes when online
    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.syncAll(outletId)
      }
    }, 5 * 60 * 1000)

    // Initial sync
    if (this.isOnline) {
      setTimeout(() => {
        this.syncAll(outletId)
      }, 3000)
    }
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }
    this.clearRetryTimer()
  }

  /**
   * True when a JWT is cached (the renderer pushed it via 'db-set-auth'). A
   * falsy token means "not logged in", so sync cycles must skip entirely rather
   * than fire unauthenticated requests that 401 and churn the backoff.
   * @returns {boolean}
   */
  hasAuth() {
    return !!SettingsDB.get('token')
  }

  getHeaders() {
    const token = SettingsDB.get('token') // Petpooja stores it as 'token' usually or fallback
    return token
      ? { 'Authorization': `Bearer ${token}` }
      : {}
  }

  saveStaffLocally(staffList) {
    const { getDB } = require('../database/localDB')
    const insert = getDB().prepare(`
      INSERT OR REPLACE INTO staff (
        id, outlet_id, name, role, pin, is_active
      ) VALUES (
        @id, @outlet_id, @name, @role, @pin, @is_active
      )
    `)
    const transaction = getDB().transaction((list) => {
      for (const s of list) {
        // /staff returns StaffProfile rows: role lives in
        // user.user_roles[].role.name, the PIN is manager_pin, the name is
        // user.full_name, and is_active is on the user. staff.role/name are
        // NOT NULL, so unmapped rows would otherwise crash the whole insert.
        insert.run({
          id: s.id,
          outlet_id: s.outlet_id,
          name: s.user?.full_name || s.name || '',
          role: s.user?.user_roles?.[0]?.role?.name || s.role || 'staff',
          pin: s.manager_pin || s.pin || null,
          is_active: (s.user?.is_active ?? s.is_active) ? 1 : 0,
        })
      }
    })
    transaction(staffList)
  }
}

module.exports = new SyncEngine()
