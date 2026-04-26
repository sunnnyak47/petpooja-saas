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
// HTML RECEIPT GENERATOR
// Used as fallback when thermal printer is not configured
// ─────────────────────────────────────
function generateReceiptHTML(bill) {
  const items = bill.items || bill.order_items || []
  const outlet = bill.outlet || {}
  const fmt = (n) => `₹${parseFloat(n || 0).toFixed(2)}`
  const itemRows = items.map(i => `
    <tr>
      <td style="padding:3px 0;font-size:12px">${i.menu_item_name || i.name}</td>
      <td style="text-align:center;font-size:12px">${i.quantity}</td>
      <td style="text-align:right;font-size:12px">${fmt((i.unit_price || i.base_price || 0) * i.quantity)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Bill ${bill.invoice_number || ''}</title>
  <style>
    body { font-family: 'Courier New', monospace; max-width: 300px; margin: 0 auto; padding: 16px; font-size: 13px; }
    h2 { text-align: center; margin: 0 0 4px; font-size: 16px; }
    .center { text-align: center; }
    .line { border-top: 1px dashed #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    .total { font-weight: bold; font-size: 14px; }
    .footer { text-align: center; margin-top: 12px; font-size: 11px; }
    @media print { body { margin: 0; } }
  </style>
  </head><body>
  <h2>${outlet.name || 'Restaurant'}</h2>
  ${outlet.address ? `<p class="center" style="margin:2px 0;font-size:11px">${outlet.address}${outlet.city ? ', ' + outlet.city : ''}</p>` : ''}
  ${outlet.phone ? `<p class="center" style="margin:2px 0;font-size:11px">Ph: ${outlet.phone}</p>` : ''}
  ${outlet.gstin ? `<p class="center" style="margin:2px 0;font-size:11px">GSTIN: ${outlet.gstin}</p>` : ''}
  <div class="line"></div>
  <table><tr>
    <td style="font-size:11px">Invoice: <b>${bill.invoice_number || 'N/A'}</b></td>
    <td style="text-align:right;font-size:11px">${new Date().toLocaleDateString('en-IN')}</td>
  </tr></table>
  ${bill.table_number ? `<p style="margin:2px 0;font-size:11px">Table: ${bill.table_number}</p>` : ''}
  <div class="line"></div>
  <table>
    <thead><tr>
      <th style="text-align:left;font-size:11px">Item</th>
      <th style="text-align:center;font-size:11px">Qty</th>
      <th style="text-align:right;font-size:11px">Amount</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="line"></div>
  <table>
    <tr><td style="font-size:12px">Subtotal</td><td style="text-align:right;font-size:12px">${fmt(bill.subtotal)}</td></tr>
    ${bill.cgst_amount || bill.cgst ? `<tr><td style="font-size:12px">CGST</td><td style="text-align:right;font-size:12px">${fmt(bill.cgst_amount || bill.cgst)}</td></tr>` : ''}
    ${bill.sgst_amount || bill.sgst ? `<tr><td style="font-size:12px">SGST</td><td style="text-align:right;font-size:12px">${fmt(bill.sgst_amount || bill.sgst)}</td></tr>` : ''}
    ${bill.service_charge ? `<tr><td style="font-size:12px">Service Charge</td><td style="text-align:right;font-size:12px">${fmt(bill.service_charge)}</td></tr>` : ''}
    ${bill.discount_amount ? `<tr><td style="font-size:12px">Discount</td><td style="text-align:right;font-size:12px">-${fmt(bill.discount_amount)}</td></tr>` : ''}
    <tr class="total"><td>TOTAL</td><td style="text-align:right">${fmt(bill.grand_total || bill.total_amount)}</td></tr>
  </table>
  <div class="line"></div>
  ${outlet.fssai ? `<p class="footer">FSSAI: ${outlet.fssai}</p>` : ''}
  <p class="footer">Thank you! Visit Again 🙏</p>
  <script>window.onload=()=>window.print()</script>
  </body></html>`
}

/**
 * Generates a KOT HTML for browser print fallback.
 */
function generateKOTHTML(kot) {
  const items = kot.items || []
  const itemRows = items.map(i => `
    <tr>
      <td style="font-size:14px;padding:4px 0;font-weight:bold">${i.quantity}x  ${i.menu_item_name || i.name}</td>
    </tr>
    ${i.variant_name ? `<tr><td style="font-size:12px;padding-left:16px;color:#555">↳ ${i.variant_name}</td></tr>` : ''}
    ${i.notes ? `<tr><td style="font-size:12px;padding-left:16px;color:#555">Note: ${i.notes}</td></tr>` : ''}`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>KOT ${kot.kot_number}</title>
  <style>
    body { font-family: 'Courier New', monospace; max-width: 280px; margin: 0 auto; padding: 16px; }
    h2 { text-align: center; font-size: 16px; margin: 0 0 4px; }
    .line { border-top: 2px dashed #000; margin: 8px 0; }
    table { width: 100%; }
    @media print { body { margin: 0; } }
  </style></head><body>
  <h2>KITCHEN ORDER TICKET</h2>
  <div class="line"></div>
  <p style="margin:2px 0">Table : <b>${kot.table_number || 'Takeaway'}</b></p>
  <p style="margin:2px 0">KOT # : <b>${kot.kot_number}</b></p>
  <p style="margin:2px 0">Time  : ${new Date().toLocaleTimeString('en-IN')}</p>
  <div class="line"></div>
  <table><tbody>${itemRows}</tbody></table>
  <div class="line"></div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`
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

      // Try thermal printer; fall back to browser print dialog
      const kotPrintData = { ...kotData, items: pendingItems }
      const kotPrint = await window.electron.printKOT(kotPrintData).catch(() => ({ success: false }))
      if (!kotPrint?.success) {
        const html = generateKOTHTML(kotPrintData)
        await window.electron.invoke('print-receipt-html', { html, title: `KOT ${kotData.kot_number}` }).catch(() => {})
      }

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
      const outlet = await invoke('db-get-outlet', order.outlet_id).catch(() => null)
      const invoiceNumber = generateInvoiceNumber(outlet)

      await invoke('db-update-order-status', orderId, 'billed', {
        invoice_number: invoiceNumber,
        billed_at: new Date().toISOString(),
      })

      const billData = { ...order, invoice_number: invoiceNumber, outlet }

      // Try thermal printer first; fall back to browser print
      const printResult = await window.electron.printBill(billData).catch(() => ({ success: false }))
      if (!printResult?.success) {
        // Generate HTML receipt and open browser print dialog
        const html = generateReceiptHTML(billData)
        await window.electron.invoke('print-receipt-html', { html, title: `Bill ${invoiceNumber}` }).catch(() => {})
      }

      return { success: true, invoice_number: invoiceNumber, ...billData }
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
