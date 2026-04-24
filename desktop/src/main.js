/**
 * Petpooja ERP — Electron Main Process
 * 
 * Bootstraps the desktop shell, wraps the React POS frontend,
 * handles IPC, thermal printing, tray, and auto-updates.
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  dialog,
  shell,
} = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')
const Store = require('electron-store')
const syncEngine = require('./sync/syncEngine')

// ─────────────────────────────────────
// CONFIGURATION STORE
// ─────────────────────────────────────
const store = new Store({
  name: 'petpooja-config',
  defaults: {
    windowBounds: {
      width: 1280,
      height: 800,
    },
    outletId: null,
    apiUrl: 'https://petpooja-saas.onrender.com',
    theme: 'midnight',
    printerIp: null,
    printerPort: 9100,
    offlineMode: false,
  },
})

// ─────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────
let mainWindow = null
let tray = null
let isOnline = true

const isDev = !app.isPackaged

/**
 * In development: load from Vite dev server (port 3001).
 * In production: load from bundled frontend/index.html via file://.
 */
const FRONTEND_URL = isDev
  ? 'http://localhost:3001'
  : `file://${path.join(process.resourcesPath, 'frontend', 'index.html')}`

// ─────────────────────────────────────
// WINDOW CREATION
// ─────────────────────────────────────
/**
 * Creates and configures the main BrowserWindow.
 * Uses saved bounds from electron-store and maximizes on show.
 */
function createWindow() {
  const { width, height } = store.get('windowBounds')

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 768,
    title: 'MS-RM System',
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // file:// origin blocks crossorigin module scripts in production
    },
    show: false,
  })

  // Show and maximize after page loads
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.maximize()
  })

  // Load React app
  mainWindow.loadURL(FRONTEND_URL)

  // Persist window size across restarts
  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize()
    store.set('windowBounds', { width: w, height: h })
  })

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  // Confirm before closing to prevent accidental exits mid-service
  mainWindow.on('close', (e) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Yes, Exit', 'Cancel'],
      defaultId: 1,
      title: 'Exit Petpooja ERP',
      message: 'Are you sure you want to exit?',
      detail: 'Make sure all orders are processed before exiting.',
      icon: path.join(__dirname, '../assets/icon.png'),
    })
    if (choice === 1) {
      e.preventDefault()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─────────────────────────────────────
// SYSTEM TRAY
// ─────────────────────────────────────
/**
 * Creates the system tray icon with context menu.
 * Double-click restores the main window.
 */
function createTray() {
  const trayIconPath = path.join(__dirname, '../assets/tray-icon.png')
  tray = new Tray(trayIconPath)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Petpooja ERP',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: '🟢 Status: Online',
      id: 'status',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => autoUpdater.checkForUpdates(),
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setToolTip('Petpooja ERP')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ─────────────────────────────────────
// ONLINE / OFFLINE DETECTION
// ─────────────────────────────────────
/**
 * Checks internet connectivity by attempting a TCP connection
 * to Google's public DNS (8.8.8.8:53). Fires renderer notifications
 * and updates the tray tooltip on status change.
 */
function checkConnectivity() {
  const net = require('net')
  const socket = new net.Socket()
  const TIMEOUT_MS = 3000

  socket.setTimeout(TIMEOUT_MS)

  socket.on('connect', () => {
    socket.destroy()
    if (!isOnline) {
      isOnline = true
      syncEngine.setOnlineStatus(true)
      notifyRenderer('connectivity-changed', { online: true })
      updateTrayStatus(true)
    }
  })

  socket.on('timeout', () => {
    socket.destroy()
    if (isOnline) {
      isOnline = false
      syncEngine.setOnlineStatus(false)
      notifyRenderer('connectivity-changed', { online: false })
      updateTrayStatus(false)
    }
  })

  socket.on('error', () => {
    socket.destroy()
    if (isOnline) {
      isOnline = false
      syncEngine.setOnlineStatus(false)
      notifyRenderer('connectivity-changed', { online: false })
      updateTrayStatus(false)
    }
  })

  socket.connect(53, '8.8.8.8')
}

/**
 * Updates the system tray tooltip and context menu label
 * to reflect current connectivity state.
 * @param {boolean} online
 */
function updateTrayStatus(online) {
  if (!tray) return
  tray.setToolTip(`Petpooja ERP — ${online ? '🟢 Online' : '🔴 Offline'}`)

  // Rebuild context menu with updated status label
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Petpooja ERP',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: online ? '🟢 Status: Online' : '🔴 Status: Offline',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => autoUpdater.checkForUpdates(),
    },
    { type: 'separator' },
    { label: 'Exit', click: () => app.quit() },
  ])
  tray.setContextMenu(contextMenu)
}

// Poll connectivity every 10 seconds
setInterval(checkConnectivity, 10000)

// ─────────────────────────────────────
// NOTIFY RENDERER
// ─────────────────────────────────────
/**
 * Safely sends an IPC message to the renderer process.
 * Checks if window is alive before sending.
 * @param {string} channel
 * @param {object} data
 */
function notifyRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

// ─────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────
/**
 * Registers all IPC handlers that the renderer (React app)
 * can invoke via window.electron.* APIs defined in preload.js.
 */
function setupIPC() {
  // Lazy-load localDB after app is ready (needs app.getPath)
  const {
    MenuDB, OrderDB, KotDB,
    TableDB, SyncDB, SettingsDB,
    getDBPath,
  } = require('./database/localDB')

  // Return full config store
  ipcMain.handle('get-config', () => store.store)

  // Persist a single config key
  ipcMain.handle('set-config', (_, key, value) => {
    store.set(key, value)
    return true
  })

  // Return current connectivity state
  ipcMain.handle('get-online-status', () => isOnline)
  
  // Sync handlers
  ipcMain.handle('sync-now', async (_, outletId) => {
    await syncEngine.syncAll(outletId)
    return true
  })

  ipcMain.handle('sync-status', () => {
    return {
      lastSync: syncEngine.lastSync,
      isSyncing: syncEngine.isSyncing,
      isOnline: syncEngine.isOnline,
    }
  })

  // Thermal printing handlers
  ipcMain.handle('print-kot', async (_, kotData) => printThermal(kotData, 'kot'))
  ipcMain.handle('print-bill', async (_, billData) => printThermal(billData, 'bill'))

  // Open the cash drawer via ESC/POS sequence
  ipcMain.handle('open-cash-drawer', async () => openCashDrawer())

  // App metadata
  ipcMain.handle('get-version', () => app.getVersion())

  // Window management
  ipcMain.handle('minimize-to-tray', () => mainWindow?.hide())
  ipcMain.handle('toggle-fullscreen', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    }
  })

  // Open URLs in the default system browser
  ipcMain.handle('open-external', (_, url) => shell.openExternal(url))

  // ── THERMAL PRINTER DISCOVERY ──────────────────────────────────
  /**
   * Scans the local subnet for ESC/POS thermal printers on port 9100.
   * Verifies open printer-port candidates through node-thermal-printer.
   * Returns an array of confirmed printer IP strings.
   */
  ipcMain.handle('discover-printers', async () => {
    return discoverPrinters()
  })

  // ── LOCAL DB: MENU ────────────────────────────────────────────
  /**
   * Returns all menu categories and items for an outlet from local SQLite.
   */
  ipcMain.handle('db-get-menu', (_, outletId) => {
    const categories = MenuDB.getCategories(outletId)
    const items = MenuDB.getItems(outletId)
    return { categories, items }
  })

  /**
   * Returns menu items filtered by category.
   */
  ipcMain.handle('db-get-menu-by-category', (_, outletId, categoryId) => {
    return MenuDB.getItems(outletId, categoryId)
  })

  /**
   * Bulk-saves menu data received from a cloud sync.
   */
  ipcMain.handle('db-save-menu-sync', (_, categories, items) => {
    MenuDB.saveMenuFromSync(categories, items)
    return true
  })

  // ── LOCAL DB: TABLES ──────────────────────────────────────────
  /**
   * Returns all tables for an outlet with their current order info.
   */
  ipcMain.handle('db-get-tables', (_, outletId) => {
    return TableDB.getAll(outletId)
  })

  /**
   * Updates the local status of a single table.
   */
  ipcMain.handle('db-update-table-status', (_, tableId, status) => {
    TableDB.updateStatus(tableId, status)
    return true
  })

  /**
   * Bulk-saves tables from a cloud sync payload.
   */
  ipcMain.handle('db-save-tables-sync', (_, tables) => {
    TableDB.saveFromSync(tables)
    return true
  })

  // ── LOCAL DB: ORDERS ──────────────────────────────────────────
  /**
   * Creates a new order in local SQLite and queues for cloud sync.
   */
  ipcMain.handle('db-create-order', (_, data) => {
    return OrderDB.create(data)
  })

  /**
   * Returns a single order with its items by ID.
   */
  ipcMain.handle('db-get-order', (_, orderId) => {
    return OrderDB.getById(orderId)
  })

  /**
   * Returns the active order on a table, with items.
   */
  ipcMain.handle('db-get-order-by-table', (_, tableId, outletId) => {
    return OrderDB.getByTable(tableId, outletId)
  })

  /**
   * Adds an item to an existing order and recalculates totals.
   */
  ipcMain.handle('db-add-order-item', (_, data) => {
    return OrderDB.addItem(data)
  })

  /**
   * Updates order status with optional extra fields (invoice, timestamps).
   */
  ipcMain.handle('db-update-order-status', (_, orderId, status, extra) => {
    OrderDB.updateStatus(orderId, status, extra)
    return true
  })

  /**
   * Returns paginated orders for an outlet with optional filters.
   */
  ipcMain.handle('db-get-orders', (_, outletId, filters) => {
    return OrderDB.getAll(outletId, filters)
  })

  /**
   * Returns all unsynced orders waiting for cloud upload.
   */
  ipcMain.handle('db-get-unsynced-orders', () => {
    return OrderDB.getUnsyncedOrders()
  })

  /**
   * Marks an order as successfully synced to cloud.
   */
  ipcMain.handle('db-mark-order-synced', (_, orderId) => {
    OrderDB.markSynced(orderId)
    return true
  })

  // ── LOCAL DB: KOT ─────────────────────────────────────────────
  /**
   * Creates a KOT with its items and marks order items as sent to kitchen.
   */
  ipcMain.handle('db-create-kot', (_, data, items) => {
    const kotId = KotDB.create(data, items)
    OrderDB.markItemsKOTSent(data.order_id)
    return kotId
  })

  /**
   * Returns all items on an order with kot_status = 'pending'.
   */
  ipcMain.handle('db-get-pending-items', (_, orderId) => {
    return OrderDB.getPendingItems(orderId)
  })

  /**
   * Returns all KOTs generated for an order.
   */
  ipcMain.handle('db-get-kots-for-order', (_, orderId) => {
    return KotDB.getForOrder(orderId)
  })

  // ── LOCAL DB: SYNC QUEUE ──────────────────────────────────────
  /**
   * Returns pending sync queue items for cloud upload.
   */
  ipcMain.handle('db-get-sync-queue', () => {
    return SyncDB.getPending()
  })

  /**
   * Marks a sync queue entry as successfully uploaded.
   */
  ipcMain.handle('db-sync-success', (_, id) => {
    SyncDB.markSuccess(id)
    return true
  })

  /**
   * Marks a sync queue entry as failed and increments attempts.
   */
  ipcMain.handle('db-sync-failed', (_, id, error) => {
    SyncDB.markFailed(id, error)
    return true
  })

  /**
   * Returns recent sync conflict audit records for an outlet.
   */
  ipcMain.handle('db-get-sync-conflicts', (_, outletId, limit) => {
    return SyncDB.getConflicts(outletId, limit)
  })

  // ── LOCAL DB: DIAGNOSTICS ─────────────────────────────────────
  /**
   * Returns the path to the local SQLite database file.
   */
  ipcMain.handle('db-get-path', () => {
    return getDBPath()
  })
}


// ─────────────────────────────────────
// AUTO UPDATER
// ─────────────────────────────────────
/**
 * Configures electron-updater to check GitHub releases.
 * Prompts user before downloading and before installing.
 */
function setupAutoUpdater() {
  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available!`,
        detail: 'Download now to get the latest features and bug fixes.',
        buttons: ['Download Now', 'Later'],
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate()
          notifyRenderer('update-downloading', {})
        }
      })
  })

  autoUpdater.on('download-progress', (progress) => {
    notifyRenderer('update-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'Restart to apply the update?',
        buttons: ['Restart Now', 'Later'],
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  // Only check automatically in production builds
  if (!isDev) {
    setTimeout(() => autoUpdater.checkForUpdates(), 5000)
  }
}

// ─────────────────────────────────────
// THERMAL PRINTING
// ─────────────────────────────────────
/**
 * Sends print data to a configured ESC/POS thermal printer via TCP.
 * @param {object} data - KOT or bill data object from React
 * @param {'kot'|'bill'} type - Print template to use
 * @returns {{ success: boolean, error?: string }}
 */
async function printThermal(data, type) {
  try {
    const { printer: ThermalPrinter, types: Types } = require('node-thermal-printer')
    const printerIp = store.get('printerIp')
    const printerPort = store.get('printerPort') || 9100

    if (!printerIp) {
      return { success: false, error: 'No printer IP configured in settings.' }
    }

    const printer = new ThermalPrinter({
      type: Types.EPSON,
      interface: `tcp://${printerIp}:${printerPort}`,
      width: 48,
      characterSet: 'PC437_USA',
      removeSpecialCharacters: false,
    })

    const isConnected = await printer.isPrinterConnected()
    if (!isConnected) {
      return { success: false, error: 'Printer not reachable on network.' }
    }

    if (type === 'kot') {
      await buildKOTPrint(printer, data)
    } else {
      await buildBillPrint(printer, data)
    }

    await printer.execute()
    printer.clear()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Builds the KOT receipt layout on the thermal printer object.
 * @param {object} printer - node-thermal-printer instance
 * @param {object} kot - KOT data with table, kot_number, items
 */
async function buildKOTPrint(printer, kot) {
  printer.alignCenter()
  printer.bold(true)
  printer.setTextSize(1, 1)
  printer.println('KITCHEN ORDER TICKET')
  printer.bold(false)
  printer.drawLine()
  printer.alignLeft()
  printer.println(`Table : ${kot.table_number || 'Takeaway'}`)
  printer.println(`KOT # : ${kot.kot_number}`)
  printer.println(`Time  : ${new Date().toLocaleTimeString('en-IN')}`)
  if (kot.source === 'qr') {
    printer.bold(true)
    printer.println('[ QR ORDER ]')
    printer.bold(false)
  }
  printer.drawLine()

  ;(kot.items || []).forEach((item) => {
    printer.bold(true)
    printer.println(`${item.quantity}x  ${item.menu_item_name}`)
    printer.bold(false)
    if (item.variant_name) printer.println(`    Variant: ${item.variant_name}`)
    if (item.addons) printer.println(`    + ${item.addons}`)
    if (item.notes) printer.println(`    Note: ${item.notes}`)
  })

  printer.drawLine()
  printer.cut()
}

/**
 * Builds the customer bill layout on the thermal printer object.
 * Includes GST breakdown, outlet GSTIN, and FSSAI.
 * @param {object} printer - node-thermal-printer instance
 * @param {object} bill - Full bill data from backend
 */
async function buildBillPrint(printer, bill) {
  printer.alignCenter()
  printer.bold(true)
  printer.setTextSize(1, 1)
  printer.println(bill.outlet?.name || 'Restaurant')
  printer.bold(false)
  if (bill.outlet?.address) printer.println(bill.outlet.address)
  if (bill.outlet?.city) printer.println(bill.outlet.city)
  if (bill.outlet?.phone) printer.println(`Ph: ${bill.outlet.phone}`)
  if (bill.outlet?.gstin) printer.println(`GSTIN: ${bill.outlet.gstin}`)
  printer.drawLine()

  printer.alignLeft()
  printer.println(`Invoice : ${bill.invoice_number}`)
  printer.println(`Date    : ${new Date().toLocaleDateString('en-IN')}`)
  printer.println(`Table   : ${bill.table_number || 'Takeaway'}`)
  if (bill.customer?.full_name) printer.println(`Customer: ${bill.customer.full_name}`)
  printer.drawLine()

  ;(bill.items || []).forEach((item) => {
    const total = ((item.unit_price || 0) * (item.quantity || 1)).toFixed(2)
    printer.tableCustom([
      { text: item.name, align: 'LEFT', width: 0.55 },
      { text: `${item.quantity}x`, align: 'CENTER', width: 0.1 },
      { text: `Rs${total}`, align: 'RIGHT', width: 0.35 },
    ])
  })

  printer.drawLine()
  printer.tableCustom([
    { text: 'Subtotal', align: 'LEFT', width: 0.6 },
    { text: `Rs${(bill.subtotal || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
  ])
  printer.tableCustom([
    { text: 'CGST (2.5%)', align: 'LEFT', width: 0.6 },
    { text: `Rs${(bill.cgst || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
  ])
  printer.tableCustom([
    { text: 'SGST (2.5%)', align: 'LEFT', width: 0.6 },
    { text: `Rs${(bill.sgst || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
  ])
  if (bill.service_charge) {
    printer.tableCustom([
      { text: 'Service Charge', align: 'LEFT', width: 0.6 },
      { text: `Rs${(bill.service_charge || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
    ])
  }
  printer.bold(true)
  printer.tableCustom([
    { text: 'TOTAL', align: 'LEFT', width: 0.6 },
    { text: `Rs${(bill.grand_total || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
  ])
  printer.bold(false)
  printer.drawLine()

  printer.alignCenter()
  if (bill.outlet?.fssai) printer.println(`FSSAI: ${bill.outlet.fssai}`)
  printer.println('Thank you! Visit Again 🙏')
  printer.cut()
}

// ─────────────────────────────────────
// THERMAL PRINTER DISCOVERY
// ─────────────────────────────────────
/**
 * Returns the primary local IPv4 address of this machine.
 * Falls back to 192.168.1.1 if none is found (LAN assumption).
 * @returns {string}
 */
function getLocalIP() {
  const os = require('os')
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '192.168.1.1'
}

/**
 * Probes a single IP:port with a TCP connection attempt.
 * Resolves with the IP string on success, null on timeout/error.
 * @param {string} ip
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<string|null>}
 */
function probeTCPHost(ip, port, timeoutMs) {
  const net = require('net')
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => { socket.destroy(); resolve(ip) })
    socket.on('timeout', () => { socket.destroy(); resolve(null) })
    socket.on('error', () => { socket.destroy(); resolve(null) })
    socket.connect(port, ip)
  })
}

/**
 * Confirms that an open TCP endpoint behaves like an ESC/POS thermal printer
 * through node-thermal-printer's connection check.
 * @param {string} ip
 * @param {number} port
 * @returns {Promise<string|null>}
 */
async function verifyThermalPrinter(ip, port) {
  try {
    const { printer: ThermalPrinter, types: Types } = require('node-thermal-printer')
    const printer = new ThermalPrinter({
      type: Types.EPSON,
      interface: `tcp://${ip}:${port}`,
      width: 48,
      characterSet: 'PC437_USA',
      removeSpecialCharacters: false,
      timeout: 1000,
    })

    const isConnected = await printer.isPrinterConnected()
    return isConnected ? ip : null
  } catch (err) {
    console.warn(`[PrinterDiscovery] Verification failed for ${ip}:${port}:`, err.message)
    return null
  }
}

/**
 * Scans the local /24 subnet for thermal printers listening on port 9100.
 * First probes port 9100, then confirms candidates through node-thermal-printer.
 * @returns {Promise<string[]>} Array of discovered printer IPs
 */
async function discoverPrinters() {
  try {
    const PRINTER_PORT = store.get('printerPort') || 9100
    const TIMEOUT_MS = 400

    const localIP = getLocalIP()
    const subnet = localIP.split('.').slice(0, 3).join('.')

    const probes = []
    for (let host = 1; host <= 254; host++) {
      probes.push(probeTCPHost(`${subnet}.${host}`, PRINTER_PORT, TIMEOUT_MS))
    }

    const openHosts = (await Promise.all(probes)).filter(Boolean)
    const verified = await Promise.all(
      openHosts.map((ip) => verifyThermalPrinter(ip, PRINTER_PORT))
    )
    const found = verified.filter(Boolean)
    console.log(`[PrinterDiscovery] Found ${found.length} printer(s) on ${subnet}.0/24:`, found)
    return found
  } catch (err) {
    console.error('[PrinterDiscovery] Discovery failed:', err)
    return []
  }
}

// ─────────────────────────────────────
// CASH DRAWER
// ─────────────────────────────────────
/**
 * Sends the ESC/POS cash drawer trigger sequence over TCP
 * to the configured printer IP (most drawers connect via printer).
 * @returns {{ success: boolean }}
 */
async function openCashDrawer() {
  try {
    const printerIp = store.get('printerIp')
    if (!printerIp) return { success: false, error: 'No printer IP configured.' }

    const net = require('net')
    const client = new net.Socket()

    return new Promise((resolve) => {
      client.connect(store.get('printerPort') || 9100, printerIp, () => {
        // Standard ESC/POS cash drawer open command
        const drawerCmd = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa])
        client.write(drawerCmd)
        client.destroy()
        resolve({ success: true })
      })
      client.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ─────────────────────────────────────
// APPLICATION MENU
// ─────────────────────────────────────
/**
 * Builds and sets the native application menu.
 * Provides View, Window, and app-level menu items.
 */
function createAppMenu() {
  const template = [
    {
      label: 'Petpooja ERP',
      submenu: [
        { label: 'About Petpooja ERP', role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => autoUpdater.checkForUpdates(),
        },
        { type: 'separator' },
        { label: 'Hide', role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { label: 'Quit Petpooja ERP', role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen())
            }
          },
        },
        { label: 'Zoom In', role: 'zoomIn' },
        { label: 'Zoom Out', role: 'zoomOut' },
        { label: 'Reset Zoom', role: 'resetZoom' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ─────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createTray()
  createAppMenu()
  setupIPC()
  setupAutoUpdater()

  // Run initial connectivity check immediately
  checkConnectivity()

  // Wake up the Render backend immediately on launch — free tier spins down after
  // inactivity and takes up to 60s to cold-start. Pinging now means it's warm by
  // the time the user finishes typing their password.
  fetch('https://petpooja-saas.onrender.com/api/health')
    .then(() => console.log('[Backend] Server warm'))
    .catch(() => console.log('[Backend] Warming up...'))

  // Start auto sync background task
  syncEngine.startAutoSync()

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Windows/Linux: quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Security: prevent any new window from opening (open in browser instead)
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
})
