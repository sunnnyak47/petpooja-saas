const { 
  OrderDB, KotDB, TableDB, 
  MenuDB, SyncDB, SettingsDB 
} = require('../database/localDB')
const { app, BrowserWindow } = require('electron')

// We will use the production backend URL for Sync, ideally configurable via setting or env
const API_URL = 'https://petpooja-saas.onrender.com/api'

class SyncEngine {
  constructor() {
    this.isOnline = false
    this.isSyncing = false
    this.syncInterval = null
    this.lastSync = null
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

  // ─────────────────────────────
  // DOWNLOAD FROM CLOUD
  // Called on app start + hourly
  // ─────────────────────────────
  async downloadFromCloud(outletId) {
    if (!this.isOnline) return
    
    try {
      this.notifyRenderer('sync-status', {
        status: 'downloading',
        message: 'Updating menu from cloud...'
      })

      // Download menu
      const menuRes = await fetch(
        `${API_URL}/menu/items?outlet_id=${outletId}&limit=1000`,
        { headers: this.getHeaders() }
      )
      if (menuRes.ok) {
        const menu = await menuRes.json()
        MenuDB.saveMenuFromSync(
          menu.data.categories || [],
          menu.data.items || []
        )
      }

      // Download tables
      const tablesRes = await fetch(
        `${API_URL}/tables?outlet_id=${outletId}`,
        { headers: this.getHeaders() }
      )
      if (tablesRes.ok) {
        const tables = await tablesRes.json()
        TableDB.saveFromSync(tables.data || [])
      }

      // Download staff (for offline PIN verify)
      const staffRes = await fetch(
        `${API_URL}/staff?outlet_id=${outletId}&limit=100`,
        { headers: this.getHeaders() }
      )
      if (staffRes.ok) {
        const staff = await staffRes.json()
        // Save to local staff table
        this.saveStaffLocally(staff.data || [])
      }

      SettingsDB.set('last_sync', 
        new Date().toISOString()
      )
      
      this.notifyRenderer('sync-status', {
        status: 'success',
        message: 'Data synced successfully'
      })

    } catch (err) {
      console.error('Download sync failed:', err)
      this.notifyRenderer('sync-status', {
        status: 'error',
        message: 'Sync failed — working offline'
      })
    }
  }

  // ─────────────────────────────
  // UPLOAD TO CLOUD
  // Called when online detected
  // ─────────────────────────────
  async uploadPendingOrders() {
    if (!this.isOnline || this.isSyncing) return

    this.isSyncing = true
    const conflicts = []
    let hasWork = false
    let synced = 0
    let failed = 0

    try {
      const unsyncedOrders = OrderDB.getUnsyncedOrders()

      if (unsyncedOrders.length === 0) {
        return
      }
      hasWork = true

      this.notifyRenderer('sync-status', {
        status: 'uploading',
        message: `Syncing ${unsyncedOrders.length} orders...`
      })

      for (const order of unsyncedOrders) {
        try {
          const items = OrderDB.getById(order.id)?.items || []

          const res = await fetch(`${API_URL}/orders/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...this.getHeaders()
            },
            body: JSON.stringify({
              order,
              items,
              source: 'offline_sync'
            })
          })

          if (res.ok) {
            OrderDB.markSynced(order.id)
            synced++
          } else {
            const resolved = await this.resolveConflict(order, res)
            if (resolved) {
              synced++
              conflicts.push({ orderId: order.id, resolution: resolved })
            } else {
              failed++
              OrderDB.markSyncError(order.id, `sync_failed_http_${res.status}`)
            }
          }
        } catch (err) {
          failed++
          OrderDB.markSyncError(order.id, err.message)
          console.error(`Failed to sync order ${order.id}:`, err)
        }
      }
    } catch (err) {
      failed++
      console.error('Upload sync failed:', err)
    } finally {
      this.isSyncing = false
      this.lastSync = new Date()

      if (!hasWork) {
        return
      }

      this.notifyRenderer('sync-status', {
        status: 'done',
        message: `Synced: ${synced}, Failed: ${failed}`,
        synced,
        failed,
      })

      if (conflicts.length > 0) {
        this.notifyRenderer('sync-conflicts', { conflicts })
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

        // Cloud order is still active — re-upload with explicit conflict flag
        // so backend can merge (offline items take priority as they are additive)
        const items = OrderDB.getById(order.id)?.items || []
        const mergeRes = await fetch(`${API_URL}/orders/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders()
          },
          body: JSON.stringify({
            order,
            items,
            source: 'offline_sync',
            conflict_resolution: 'merge_items'
          })
        })

        if (mergeRes.ok) {
          OrderDB.markSynced(order.id)
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
              item_count: items.length,
              cloud_updated_at: cloudOrder.updated_at,
              local_updated_at: order.updated_at,
            },
          })
          console.log(`[SyncEngine] Conflict resolved (409): order ${order.id} — items merged.`)
          return 'items_merged'
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

    try {
      // We get outlet_id dynamically from Settings to allow full background sync without args
      const currentOutletId = outletId || SettingsDB.get('outlet_id')

      await this.uploadPendingOrders()

      if (currentOutletId) {
        await this.downloadFromCloud(currentOutletId)
      }
    } catch (err) {
      console.error('Full sync failed:', err)
      this.notifyRenderer('sync-status', {
        status: 'error',
        message: 'Sync failed — working offline'
      })
    }
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
        insert.run({
          id: s.id,
          outlet_id: s.outlet_id,
          name: s.name || s.user?.full_name || '',
          role: s.role,
          pin: s.pin || null,
          is_active: s.is_active ? 1 : 0
        })
      }
    })
    transaction(staffList)
  }
}

module.exports = new SyncEngine()
