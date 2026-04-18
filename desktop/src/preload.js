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
})
