/**
 * Petpooja ERP — Electron Preload Script
 * 
 * Exposes a safe, locked-down window.electron API to the React
 * renderer process via contextBridge. The renderer has NO direct
 * access to Node.js modules — only what is listed here.
 */

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Safe wrapper around ipcRenderer.on that returns a cleanup function.
 * Prevents memory leaks from dangling listeners.
 * @param {string} channel
 * @param {Function} callback
 * @returns {Function} cleanup function
 */
function onEvent(channel, callback) {
  const handler = (_, data) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('electron', {

  // ─── Config ────────────────────────────────────────────────────
  /** Get full config store object */
  getConfig: () =>
    ipcRenderer.invoke('get-config'),

  /** Persist a config value by key */
  setConfig: (key, value) =>
    ipcRenderer.invoke('set-config', key, value),

  /**
   * Push the renderer's JWT + outlet id into the main-process sync engine
   * (called by authSlice.setCredentials after login, and with nulls on logout).
   * Without this the background sync engine has no token/outlet and 401s.
   * @param {{ token: string|null, outletId: string|null }} auth
   */
  setAuth: ({ token, outletId }) =>
    ipcRenderer.invoke('db-set-auth', { token, outletId }),

  // ─── Connectivity ──────────────────────────────────────────────
  /** Get current online status (boolean) */
  getOnlineStatus: () =>
    ipcRenderer.invoke('get-online-status'),

  /**
   * Subscribe to connectivity changes.
   * @param {Function} callback - receives { online: boolean }
   * @returns {Function} unsubscribe function
   */
  onConnectivityChange: (callback) =>
    onEvent('connectivity-changed', callback),

  // ─── Thermal Printing ──────────────────────────────────────────
  /**
   * Print a KOT to the configured thermal printer.
   * @param {object} kotData - KOT data from backend
   * @returns {{ success: boolean, error?: string }}
   */
  printKOT: (kotData) =>
    ipcRenderer.invoke('print-kot', kotData),

  /**
   * Print a customer bill to the configured thermal printer.
   * @param {object} billData - Bill data from backend
   * @returns {{ success: boolean, error?: string }}
   */
  printBill: (billData) =>
    ipcRenderer.invoke('print-bill', billData),

  /** Trigger cash drawer opening via ESC/POS */
  openCashDrawer: () =>
    ipcRenderer.invoke('open-cash-drawer'),

  /**
   * Scan the local subnet for thermal printers on port 9100.
   * @returns {Promise<string[]>} Array of discovered printer IPs
   */
  discoverPrinters: () =>
    ipcRenderer.invoke('discover-printers'),

  // ─── App / Window ──────────────────────────────────────────────
  /** Get the current app version string */
  getVersion: () =>
    ipcRenderer.invoke('get-version'),

  /** Hide window to system tray */
  minimizeToTray: () =>
    ipcRenderer.invoke('minimize-to-tray'),

  /** Toggle fullscreen mode */
  toggleFullscreen: () =>
    ipcRenderer.invoke('toggle-fullscreen'),

  /**
   * Open a URL in the system default browser.
   * @param {string} url
   */
  openExternal: (url) =>
    ipcRenderer.invoke('open-external', url),

  /** Request native microphone permission for Voice POS */
  requestMicrophoneAccess: () =>
    ipcRenderer.invoke('request-microphone-access'),

  // ─── Updates ───────────────────────────────────────────────────
  /** Manually trigger an update check */
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),

  /** Subscribe to update status events */
  onUpdateStatus: (callback) =>
    onEvent('update-status', callback),

  /** Subscribe to update download start events */
  onUpdateDownloading: (callback) =>
    onEvent('update-downloading', callback),

  /** Subscribe to update download progress */
  onUpdateProgress: (callback) =>
    onEvent('update-progress', callback),

  /** Subscribe to update ready events */
  onUpdateReady: (callback) =>
    onEvent('update-ready', callback),

  // ─── Sync Engine ───────────────────────────────────────────────
  /** Trigger a manual sync */
  syncNow: (outletId) =>
    ipcRenderer.invoke('sync-now', outletId),

  /** Get the current sync engine status */
  getSyncStatus: () =>
    ipcRenderer.invoke('sync-status'),

  /** Subscribe to sync status updates */
  onSyncStatus: (callback) =>
    onEvent('sync-status', callback),

  /**
   * Subscribe to sync conflict notifications.
   * Fired when offline orders had conflicts with cloud state.
   * @param {Function} callback - receives { conflicts: Array<{ orderId, resolution }> }
   * @returns {Function} unsubscribe function
   */
  onSyncConflicts: (callback) =>
    onEvent('sync-conflicts', callback),

  // ─── Feature Detection ─────────────────────────────────────────
  /** True when running inside Electron desktop app */
  isElectron: true,

  // ─── Generic IPC Invoke ────────────────────────────────────────
  /**
   * Low-level IPC invoke for dynamic channel calls.
   * Used by offlineAPI.js for the hybrid API layer.
   * @param {string} channel
   * @param {...any} args
   */
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // ─── Local Database: Menu ─────────────────────────────────────
  /** Get full menu (categories + items) from local SQLite */
  dbGetMenu: (outletId) =>
    ipcRenderer.invoke('db-get-menu', outletId),

  /** Get items by category from local SQLite */
  dbGetMenuByCategory: (outletId, categoryId) =>
    ipcRenderer.invoke('db-get-menu-by-category', outletId, categoryId),

  /** Save menu data received from cloud sync */
  dbSaveMenuSync: (categories, items) =>
    ipcRenderer.invoke('db-save-menu-sync', categories, items),

  // ─── Local Database: Tables ───────────────────────────────────
  /** Get all tables with current active order info */
  dbGetTables: (outletId) =>
    ipcRenderer.invoke('db-get-tables', outletId),

  /** Update table status locally */
  dbUpdateTableStatus: (tableId, status) =>
    ipcRenderer.invoke('db-update-table-status', tableId, status),

  /** Save tables from cloud sync */
  dbSaveTablesSync: (tables) =>
    ipcRenderer.invoke('db-save-tables-sync', tables),

  // ─── Local Database: Orders ───────────────────────────────────
  /** Create a new order in local SQLite */
  dbCreateOrder: (data) =>
    ipcRenderer.invoke('db-create-order', data),

  /** Get a full order with items by ID */
  dbGetOrder: (orderId) =>
    ipcRenderer.invoke('db-get-order', orderId),

  /** Get active order for a table */
  dbGetOrderByTable: (tableId, outletId) =>
    ipcRenderer.invoke('db-get-order-by-table', tableId, outletId),

  /** Add an item to an order */
  dbAddOrderItem: (data) =>
    ipcRenderer.invoke('db-add-order-item', data),

  /** Update order status + optional timestamp/invoice fields */
  dbUpdateOrderStatus: (orderId, status, extra) =>
    ipcRenderer.invoke('db-update-order-status', orderId, status, extra),

  /** Get all orders for an outlet with optional filters */
  dbGetOrders: (outletId, filters) =>
    ipcRenderer.invoke('db-get-orders', outletId, filters),

  /** Get orders not yet synced to cloud */
  dbGetUnsyncedOrders: () =>
    ipcRenderer.invoke('db-get-unsynced-orders'),

  /** Mark an order as synced to cloud (optionally recording the cloud order number) */
  dbMarkOrderSynced: (orderId, cloudOrderNumber) =>
    ipcRenderer.invoke('db-mark-order-synced', orderId, cloudOrderNumber),

  /** Get the next sequential offline invoice number for an outlet */
  dbNextInvoiceNumber: (outletId) =>
    ipcRenderer.invoke('db-next-invoice-number', outletId),

  /** Get the end-of-day summary computed from local orders */
  dbEodSummary: (outletId, date) =>
    ipcRenderer.invoke('db-eod-summary', outletId, date),

  /** Get the count of orders not yet uploaded to cloud */
  dbUnsyncedCount: () =>
    ipcRenderer.invoke('db-unsynced-count'),

  // ─── Local Database: Customers ────────────────────────────────
  /** Search cached customers by name or phone */
  dbSearchCustomers: (outletId, query) =>
    ipcRenderer.invoke('db-search-customers', outletId, query),

  /** Create a walk-in customer locally (queued for cloud sync) */
  dbCreateCustomer: (data) =>
    ipcRenderer.invoke('db-create-customer', data),

  /** Save customers from cloud sync (lookup cache) */
  dbSaveCustomersSync: (customers) =>
    ipcRenderer.invoke('db-save-customers-sync', customers),

  // ─── Local Database: KOT ─────────────────────────────────────
  /** Create a KOT with items and mark order items as sent */
  dbCreateKOT: (data, items) =>
    ipcRenderer.invoke('db-create-kot', data, items),

  /** Get items still pending KOT generation for an order */
  dbGetPendingItems: (orderId) =>
    ipcRenderer.invoke('db-get-pending-items', orderId),

  /** Get all KOTs generated for an order */
  dbGetKOTsForOrder: (orderId) =>
    ipcRenderer.invoke('db-get-kots-for-order', orderId),

  // ─── Local Database: Sync Queue ───────────────────────────────
  /** Get pending sync queue entries */
  dbGetSyncQueue: () =>
    ipcRenderer.invoke('db-get-sync-queue'),

  /** Mark a sync entry as success (delete it) */
  dbSyncSuccess: (id) =>
    ipcRenderer.invoke('db-sync-success', id),

  /** Mark a sync entry as failed (increment attempts) */
  dbSyncFailed: (id, error) =>
    ipcRenderer.invoke('db-sync-failed', id, error),

  /** Get recent offline/cloud sync conflicts for an outlet */
  dbGetSyncConflicts: (outletId, limit) =>
    ipcRenderer.invoke('db-get-sync-conflicts', outletId, limit),

  // ─── Diagnostics ──────────────────────────────────────────────
  /** Get the absolute path to the local SQLite DB file */
  dbGetPath: () =>
    ipcRenderer.invoke('db-get-path'),

  /** Get the stable device id used to namespace offline numbers */
  dbGetDeviceId: () =>
    ipcRenderer.invoke('db-get-device-id'),

  /** Get outlet data for offline bill header */
  dbGetOutlet: (outletId) =>
    ipcRenderer.invoke('db-get-outlet', outletId),

  /** Print receipt HTML via browser print dialog (fallback for no thermal printer) */
  printReceiptHTML: (html, title) =>
    ipcRenderer.invoke('print-receipt-html', { html, title }),
})
