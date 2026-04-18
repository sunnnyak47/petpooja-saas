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

  // ─── Updates ───────────────────────────────────────────────────
  /**
   * Subscribe to update download start events.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  onUpdateDownloading: (callback) =>
    onEvent('update-downloading', callback),

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

  /** Mark an order as synced to cloud */
  dbMarkOrderSynced: (orderId) =>
    ipcRenderer.invoke('db-mark-order-synced', orderId),

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

  // ─── Diagnostics ──────────────────────────────────────────────
  /** Get the absolute path to the local SQLite DB file */
  dbGetPath: () =>
    ipcRenderer.invoke('db-get-path'),
})
