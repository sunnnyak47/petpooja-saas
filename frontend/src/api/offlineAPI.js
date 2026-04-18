/**
 * Petpooja ERP — Offline-First Hybrid API Layer
 *
 * This module is the single entry point for all POS data operations.
 * It decides at runtime whether to use the local SQLite database
 * (via Electron IPC) or the cloud REST API, based on the environment.
 *
 * Decision logic:
 *   - Electron desktop → always use local SQLite first
 *   - Browser / web   → use cloud API (Axios via lib/api.js)
 *
 * For operators using the desktop app:
 *   1. Data is written to SQLite instantly (no internet needed)
 *   2. The background sync service uploads to cloud when online
 *   3. Cloud data is the source of truth for reporting
 */

import api from '../lib/api'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron

// ─────────────────────────────────────
// HELPERS
// ─────────────────────────────────────
/**
 * Invokes an Electron IPC channel from the renderer.
 * @param {string} channel
 * @param {...any} args
 * @returns {Promise<any>}
 */
const invoke = (channel, ...args) => {
  if (!IS_ELECTRON) throw new Error(`IPC invoke called outside Electron: ${channel}`)
  return window.electron.invoke(channel, ...args)
}

/**
 * Generates a unique invoice number using outlet+date+sequence.
 * Format: FY2526-<OUTLET_SHORT>-<SEQUENCE>
 * @param {object} outlet
 * @returns {string}
 */
function generateInvoiceNumber(outlet) {
  const now = new Date()
  const fyYear = now.getMonth() >= 3
    ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`
  const seq = String(Date.now()).slice(-6)
  const shortName = (outlet?.name || 'POS').slice(0, 3).toUpperCase()
  return `${fyYear}-${shortName}-${seq}`
}

// ─────────────────────────────────────
// HYBRID API
// ─────────────────────────────────────
export const hybridAPI = {

  // ── MENU ────────────────────────────────────────────────────────
  /**
   * Returns the full menu (categories + items).
   * Electron: from local SQLite.
   * Browser: from cloud REST API.
   * @param {string} outletId
   * @returns {{ categories: object[], items: object[] }}
   */
  async getMenu(outletId) {
    if (IS_ELECTRON) {
      return invoke('db-get-menu', outletId)
    }
    const [catRes, itemRes] = await Promise.all([
      api.get('/menu/categories', { params: { outlet_id: outletId } }),
      api.get('/menu/items', { params: { outlet_id: outletId } }),
    ])
    return {
      categories: catRes.data?.data || [],
      items: itemRes.data?.data || [],
    }
  },

  // ── TABLES ──────────────────────────────────────────────────────
  /**
   * Returns all tables with their current active order info.
   * Electron: from local SQLite.
   * Browser: from cloud REST API.
   * @param {string} outletId
   * @returns {object[]}
   */
  async getTables(outletId) {
    if (IS_ELECTRON) {
      return invoke('db-get-tables', outletId)
    }
    const res = await api.get('/tables', { params: { outlet_id: outletId } })
    return res.data?.data || []
  },

  // ── ORDERS ──────────────────────────────────────────────────────
  /**
   * Creates a new order. In Electron, saves locally and marks table occupied.
   * @param {object} data - order payload (outlet_id, table_id, order_type, etc.)
   * @returns {{ id: string }}
   */
  async createOrder(data) {
    if (IS_ELECTRON) {
      const id = await invoke('db-create-order', data)
      if (data.table_id) {
        await invoke('db-update-table-status', data.table_id, 'occupied')
      }
      return { id, ...data }
    }
    const res = await api.post('/orders', data)
    return res.data?.data
  },

  /**
   * Returns an order with its items by ID.
   * @param {string} orderId
   */
  async getOrder(orderId) {
    if (IS_ELECTRON) {
      return invoke('db-get-order', orderId)
    }
    const res = await api.get(`/orders/${orderId}`)
    return res.data?.data
  },

  /**
   * Returns the active order on a table.
   * @param {string} tableId
   * @param {string} outletId
   */
  async getOrderByTable(tableId, outletId) {
    if (IS_ELECTRON) {
      return invoke('db-get-order-by-table', tableId, outletId)
    }
    const res = await api.get('/orders', { params: { table_id: tableId, outlet_id: outletId, status: 'active' } })
    return res.data?.data?.[0] || null
  },

  /**
   * Adds an item to an existing order. Recalculates totals.
   * @param {object} itemData
   */
  async addOrderItem(itemData) {
    if (IS_ELECTRON) {
      return invoke('db-add-order-item', itemData)
    }
    const res = await api.post(`/orders/${itemData.order_id}/items`, itemData)
    return res.data?.data
  },

  // ── KOT ─────────────────────────────────────────────────────────
  /**
   * Generates a KOT for all pending items on an order.
   * Electron: creates KOT locally, marks items as sent, prints via thermal.
   * Browser: calls cloud API.
   * @param {string} orderId
   * @returns {{ success: boolean, kot_id: string, items_count: number }|null}
   */
  async generateKOT(orderId) {
    if (IS_ELECTRON) {
      const pendingItems = await invoke('db-get-pending-items', orderId)
      if (!pendingItems || pendingItems.length === 0) {
        return { success: false, error: 'No pending items to send to kitchen.' }
      }

      const order = await invoke('db-get-order', orderId)
      const kotNumber = `KOT-${Date.now()}`

      const kotData = {
        order_id: orderId,
        outlet_id: order.outlet_id,
        kot_number: kotNumber,
        table_number: order.table_number,
        source: order.source || 'pos',
        items_count: pendingItems.length,
        printed_at: new Date().toISOString(),
      }

      // Create KOT locally (also marks items as sent internally)
      const kotId = await invoke('db-create-kot', kotData, pendingItems.map((i) => ({
        order_item_id: i.id,
        menu_item_name: i.menu_item_name,
        quantity: i.quantity,
        notes: i.notes || null,
        addons: i.variant_name || null,
      })))

      // Fire-and-forget print (don't block on printer errors)
      window.electron.printKOT({
        ...kotData,
        items: pendingItems,
      }).catch(() => {}) // Printer errors are non-fatal

      return { success: true, kot_id: kotId, items_count: pendingItems.length }
    }

    const res = await api.post(`/orders/${orderId}/kot`)
    return res.data?.data
  },

  // ── BILLING ─────────────────────────────────────────────────────
  /**
   * Generates a bill for an order (status → billed).
   * Electron: updates locally, assigns invoice number, prints.
   * Browser: calls cloud API.
   * @param {string} orderId
   * @returns {{ success: boolean, invoice_number: string }}
   */
  async generateBill(orderId) {
    if (IS_ELECTRON) {
      const order = await invoke('db-get-order', orderId)
      const invoiceNumber = generateInvoiceNumber(null)

      await invoke('db-update-order-status', orderId, 'billed', {
        invoice_number: invoiceNumber,
        billed_at: new Date().toISOString(),
      })

      // Print bill (non-blocking)
      window.electron.printBill({ ...order, invoice_number: invoiceNumber }).catch(() => {})

      return { success: true, invoice_number: invoiceNumber }
    }

    const res = await api.post(`/orders/${orderId}/bill`)
    return res.data?.data
  },

  // ── PAYMENT ─────────────────────────────────────────────────────
  /**
   * Processes payment for an order (status → paid).
   * Electron: updates locally, frees table, opens cash drawer if cash.
   * Browser: calls cloud API.
   * @param {string} orderId
   * @param {{ method: string, amount: number, reference?: string }} paymentData
   * @returns {{ success: boolean }}
   */
  async processPayment(orderId, paymentData) {
    if (IS_ELECTRON) {
      await invoke('db-update-order-status', orderId, 'paid', {
        payment_method: paymentData.method,
        paid_at: new Date().toISOString(),
      })

      // Free the table
      const order = await invoke('db-get-order', orderId)
      if (order?.table_id) {
        await invoke('db-update-table-status', order.table_id, 'available')
      }

      // Open cash drawer for cash payments (non-blocking)
      if (paymentData.method === 'cash') {
        window.electron.openCashDrawer().catch(() => {})
      }

      return { success: true }
    }

    const res = await api.post(`/orders/${orderId}/payment`, paymentData)
    return res.data?.data
  },

  // ── ORDER HISTORY ────────────────────────────────────────────────
  /**
   * Returns paginated order history with optional filters.
   * @param {string} outletId
   * @param {{ status?: string, date?: string }} filters
   */
  async getOrders(outletId, filters = {}) {
    if (IS_ELECTRON) {
      return invoke('db-get-orders', outletId, filters)
    }
    const res = await api.get('/orders', { params: { outlet_id: outletId, ...filters } })
    return res.data?.data || []
  },

  // ── CLOUD SYNC ───────────────────────────────────────────────────
  /**
   * Syncs cloud menu data into local SQLite.
   * Call this on app startup when online.
   * @param {string} outletId
   */
  async syncMenuFromCloud(outletId) {
    if (!IS_ELECTRON) return

    try {
      const [catRes, itemRes] = await Promise.all([
        api.get('/menu/categories', { params: { outlet_id: outletId } }),
        api.get('/menu/items', { params: { outlet_id: outletId } }),
      ])
      await invoke('db-save-menu-sync',
        catRes.data?.data || [],
        itemRes.data?.data || []
      )
    } catch (err) {
      console.warn('[HybridAPI] Menu sync from cloud failed:', err.message)
    }
  },

  /**
   * Syncs cloud table layout into local SQLite.
   * @param {string} outletId
   */
  async syncTablesFromCloud(outletId) {
    if (!IS_ELECTRON) return

    try {
      const res = await api.get('/tables', { params: { outlet_id: outletId } })
      await invoke('db-save-tables-sync', res.data?.data || [])
    } catch (err) {
      console.warn('[HybridAPI] Tables sync from cloud failed:', err.message)
    }
  },

  /**
   * Uploads unsynced local orders to the cloud.
   * Run periodically when online.
   */
  async flushOrdersToCloud() {
    if (!IS_ELECTRON) return

    const unsynced = await invoke('db-get-unsynced-orders')
    for (const order of unsynced) {
      try {
        await api.post('/orders/sync', order)
        await invoke('db-mark-order-synced', order.id)
      } catch (err) {
        console.warn(`[HybridAPI] Failed to sync order ${order.id}:`, err.message)
      }
    }
  },
}

export default hybridAPI
