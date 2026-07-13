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
  session,
  systemPreferences,
  protocol,
} = require('electron')

// Keep app:// registered as a privileged scheme — used as fallback if the
// local HTTP server fails to start. Must be called before app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      corsEnabled: true,
    },
  },
])
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
let localServer = null        // HTTP server for production frontend serving
let localServerPort = 0       // assigned at runtime
let connFailStreak = 0        // consecutive failed connectivity probes
let connInitialized = false   // whether the first connectivity probe has resolved
const CONN_FAIL_THRESHOLD = 2 // require N misses before declaring offline (debounce cold-starts)

const isDev = !app.isPackaged

/**
 * Start a local HTTP static file server to serve the bundled frontend.
 *
 * Why: webkitSpeechRecognition (Web Speech API) requires an http:// or https://
 * origin.  Google's speech-recognition service rejects requests from the custom
 * app:// scheme, producing a "network" error every time the mic is tapped.
 * Serving from http://127.0.0.1:<port> fixes that and also makes getUserMedia,
 * service workers, and other secure-context APIs behave identically to Chrome.
 *
 * Port 0 → OS picks a free ephemeral port; no hard-coded port conflicts.
 */
function startLocalFrontendServer(frontendDir) {
  return new Promise((resolve, reject) => {
    const http = require('http')
    const fs   = require('fs')

    const MIME = {
      '.html' : 'text/html; charset=utf-8',
      '.js'   : 'application/javascript',
      '.mjs'  : 'application/javascript',
      '.css'  : 'text/css',
      '.json' : 'application/json',
      '.png'  : 'image/png',
      '.jpg'  : 'image/jpeg',
      '.jpeg' : 'image/jpeg',
      '.svg'  : 'image/svg+xml',
      '.ico'  : 'image/x-icon',
      '.woff' : 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf'  : 'font/ttf',
      '.eot'  : 'application/vnd.ms-fontobject',
      '.map'  : 'application/json',
    }

    localServer = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0].split('#')[0]
      if (urlPath === '/') urlPath = '/index.html'
      urlPath = decodeURIComponent(urlPath)

      const fullPath = path.join(frontendDir, urlPath)
      const ext      = path.extname(fullPath).toLowerCase()

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        fs.createReadStream(fullPath).pipe(res)
      } else {
        // SPA fallback — any unknown path serves index.html so React Router works
        const indexPath = path.join(frontendDir, 'index.html')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        fs.createReadStream(indexPath).pipe(res)
      }
    })

    localServer.on('error', (err) => {
      console.error('[LocalServer] Failed to start:', err.message)
      reject(err)
    })

    // Port 0 = OS assigns a random free port
    localServer.listen(0, '127.0.0.1', () => {
      localServerPort = localServer.address().port
      console.log(`[LocalServer] Serving frontend at http://127.0.0.1:${localServerPort}`)
      resolve(localServerPort)
    })
  })
}

// FRONTEND_URL is set after the local server starts (see app.whenReady below).
// In dev it stays as the Vite dev-server URL.
let FRONTEND_URL = isDev ? 'http://localhost:3001' : null

/**
 * Allows renderer microphone access for Voice POS and exposes the native
 * macOS permission prompt through IPC.
 */
function setupMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'media') {
      const mediaTypes = details?.mediaTypes || []
      callback(mediaTypes.length === 0 || mediaTypes.includes('audio'))
      return
    }
    callback(false)
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission !== 'media') return false
    const mediaType = details?.mediaType
    return !mediaType || mediaType === 'audio'
  })
}

// ─────────────────────────────────────
// WINDOW CREATION
// ─────────────────────────────────────
/**
 * Creates and configures the main BrowserWindow.
 * Uses saved bounds from electron-store and maximizes on show.
 */
function createWindow() {
  const { width, height } = store.get('windowBounds')

  console.log('[createWindow] isDev:', isDev)
  console.log('[createWindow] FRONTEND_URL:', FRONTEND_URL)
  console.log('[createWindow] resourcesPath:', process.resourcesPath)
  console.log('[createWindow] __dirname:', __dirname)

  // Verify frontend files exist before loading
  const fs = require('fs')
  const frontendDir = path.join(process.resourcesPath, 'frontend')
  const indexPath   = path.join(frontendDir, 'index.html')
  console.log('[createWindow] frontendDir:', frontendDir)
  console.log('[createWindow] index.html exists:', fs.existsSync(indexPath))
  if (fs.existsSync(frontendDir)) {
    console.log('[createWindow] frontend/ contents:', fs.readdirSync(frontendDir))
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 768,
    title: 'MS-RM System',
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Position traffic lights inside the 52px sidebar header area,
    // vertically centred and spaced from the left edge.
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 18 } : undefined,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    show: false,
  })

  // ── DIAGNOSTIC EVENTS ──────────────────────────────────
  mainWindow.webContents.on('did-start-loading',  () => console.log('[Renderer] did-start-loading'))
  mainWindow.webContents.on('dom-ready',          () => console.log('[Renderer] dom-ready'))
  mainWindow.webContents.on('did-finish-load',    () => console.log('[Renderer] did-finish-load'))
  mainWindow.webContents.on('did-stop-loading',   () => console.log('[Renderer] did-stop-loading'))
  mainWindow.once('ready-to-show',                () => console.log('[Renderer] ready-to-show ← window will now show'))

  // Forward renderer console.log / errors to main process stdout
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['verbose', 'info', 'warning', 'error']
    console.log(`[Renderer:${levels[level] || level}] ${message}  (${sourceId}:${line})`)
  })

  // Show and maximize after page loads
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.maximize()
  })

  // Fallback: show window after 6s even if ready-to-show never fires
  const showFallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[createWindow] ⚠ Fallback show triggered — ready-to-show never fired')
      mainWindow.show()
      mainWindow.focus()
      mainWindow.maximize()
      // Open DevTools so we can see what went wrong
      mainWindow.webContents.openDevTools()
    }
  }, 6000)
  mainWindow.once('show', () => clearTimeout(showFallback))

  // Retry on load failure
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main] ❌ Page load FAILED:', errorCode, errorDescription, 'url:', validatedURL)
    if (errorCode === -3) return // Aborted
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('[Main] Retrying loadURL...')
        mainWindow.loadURL(FRONTEND_URL)
      }
    }, 1500)
  })

  // Catch unhandled renderer JS errors
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main] ❌ Renderer process gone:', details.reason, details.exitCode)
  })
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[Main] ⚠ Renderer UNRESPONSIVE')
  })

  // Load React app
  console.log('[createWindow] calling loadURL:', FRONTEND_URL)
  mainWindow.loadURL(FRONTEND_URL)

  // Persist window size across restarts
  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize()
    store.set('windowBounds', { width: w, height: h })
  })

  // Open DevTools in development only
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
 * Applies a connectivity result, firing renderer notifications and updating
 * the tray only when the state actually changes (avoids redundant IPC spam).
 * @param {boolean} online
 */
function applyConnectivity(online) {
  // Always propagate the very first resolved probe so the sync engine (which
  // starts as offline) and tray get synced to the real state, even if it
  // happens to match main's optimistic initial `isOnline = true`.
  if (online === isOnline && connInitialized) return
  connInitialized = true
  isOnline = online
  syncEngine.setOnlineStatus(online)
  notifyRenderer('connectivity-changed', { online })
  updateTrayStatus(online)
}

/**
 * Checks connectivity by issuing a lightweight HTTPS request to the actual
 * backend health endpoint.
 *
 * Why not ping 8.8.8.8:53 (the old approach)? Raw TCP to Google's DNS port is
 * blocked on many real networks — home routers, café/guest Wi-Fi, and corporate
 * firewalls routinely allow only HTTPS (443) outbound and drop port 53 to
 * external IPs. That produced a false "Offline" banner even when the internet
 * (and our backend) worked fine. Probing the backend over HTTPS both avoids that
 * blocked-port problem and makes "online" mean what the app actually cares
 * about: the cloud API is reachable.
 */
function checkConnectivity() {
  const https = require('https')
  const TIMEOUT_MS = 4000

  let base = store.get('apiUrl') || 'https://petpooja-saas.onrender.com'
  let healthUrl
  try {
    healthUrl = new URL('/health', base)
  } catch {
    healthUrl = new URL('https://petpooja-saas.onrender.com/health')
  }

  const req = https.request(
    {
      hostname: healthUrl.hostname,
      port: healthUrl.port || 443,
      path: healthUrl.pathname,
      method: 'GET',
      timeout: TIMEOUT_MS,
    },
    (res) => {
      // Any HTTP response (even 4xx/5xx) proves the network path is open.
      res.resume() // drain so the socket can free
      connFailStreak = 0
      applyConnectivity(true)
    }
  )

  // A single miss can be a cold-start or a dropped packet — only flip to
  // offline after CONN_FAIL_THRESHOLD consecutive failures.
  const registerFailure = () => {
    connFailStreak += 1
    if (connFailStreak >= CONN_FAIL_THRESHOLD) applyConnectivity(false)
  }

  req.on('timeout', () => {
    req.destroy()
    registerFailure()
  })

  req.on('error', () => {
    registerFailure()
  })

  req.end()
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
    TableDB, SyncDB, OutboxDB, SettingsDB, OutletDB, CustomerDB,
    getDBPath,
    nextOfflineInvoiceNumber, getDeviceId,
  } = require('./database/localDB')

  // Return full config store
  ipcMain.handle('get-config', () => store.store)

  // Persist a single config key
  ipcMain.handle('set-config', (_, key, value) => {
    store.set(key, value)
    // Mirror the outlet id into the SQLite settings cache too — the sync engine
    // reads SettingsDB.get('outlet_id') for downloadFromCloud (background sync
    // without args), which electron-store alone doesn't feed.
    if (key === 'outlet_id') SettingsDB.set('outlet_id', value)
    return true
  })

  // ── AUTH BRIDGE (renderer JWT → main-process sync engine) ─────
  /**
   * The renderer pushes its JWT + outlet id here after login (and clears them
   * on logout). The sync engine's getHeaders() reads SettingsDB.get('token')
   * and downloadFromCloud reads SettingsDB.get('outlet_id'), so without this
   * bridge background sync has no credentials and silently 401s.
   */
  ipcMain.handle('db-set-auth', (_, { token, outletId } = {}) => {
    // Distinguish an explicit CLEAR (logout sends token: null) from an ABSENT
    // field (a partial update that only carries outletId, say). Writing null on
    // an explicit clear makes getHeaders() return {} and the sync cycles skip —
    // otherwise a stale token would keep syncing after logout.
    if (token !== undefined) SettingsDB.set('token', token || null)
    if (outletId !== undefined) SettingsDB.set('outlet_id', outletId || null)
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

  // ── MICROPHONE PERMISSION ─────────────────────────────────────
  ipcMain.handle('request-microphone-access', async () => {
    try {
      if (process.platform !== 'darwin') {
        return { granted: true, status: 'granted' }
      }

      const status = systemPreferences.getMediaAccessStatus('microphone')
      if (status === 'granted') {
        return { granted: true, status }
      }
      if (status === 'denied' || status === 'restricted') {
        return { granted: false, status }
      }

      const granted = await systemPreferences.askForMediaAccess('microphone')
      return {
        granted,
        status: systemPreferences.getMediaAccessStatus('microphone'),
      }
    } catch (err) {
      return { granted: false, status: 'error', error: err.message }
    }
  })

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

  // ── LOCAL DB: OFFLINE POS ACTIONS ─────────────────────────────
  // Whole-order-state mutations. Each writes the order's FINAL local state and
  // sets synced = 0 so syncEngine re-sends the full order via POST /orders/sync
  // (backend forward-merge reconciles). Every handler returns the updated
  // order (or split result) so the renderer can do an optimistic cache update.

  /** Move an order to a different table (frees old, seizes new). */
  ipcMain.handle('db-transfer-table', (_, orderId, newTableId) => {
    return OrderDB.transferTable(orderId, newTableId)
  })

  /** Merge a source order into a target (moves items + KOTs, retires source). */
  ipcMain.handle('db-merge-orders', (_, sourceOrderId, targetOrderId) => {
    return OrderDB.mergeOrders(sourceOrderId, targetOrderId)
  })

  /** Item-split: spin the given order_item ids off into a new local order. */
  ipcMain.handle('db-split-order', (_, orderId, payload) => {
    return OrderDB.splitOrder(orderId, payload)
  })

  /** Void (cancel) an order with a reason; frees its table. */
  ipcMain.handle('db-void-order', (_, orderId, reason) => {
    return OrderDB.voidOrder(orderId, reason)
  })

  /** Void a single line item and recompute the order totals. */
  ipcMain.handle('db-void-item', (_, orderId, itemId) => {
    return OrderDB.voidItem(orderId, itemId)
  })

  /** Apply a percentage/flat discount and recompute the order totals. */
  ipcMain.handle('db-apply-discount', (_, orderId, data) => {
    return OrderDB.applyDiscount(orderId, data)
  })

  /** Comp an order (on the house) — nets the grand total to 0. */
  ipcMain.handle('db-comp-order', (_, orderId) => {
    return OrderDB.compOrder(orderId)
  })

  /** Update an order's free-text notes. */
  ipcMain.handle('db-update-notes', (_, orderId, notes) => {
    return OrderDB.updateNotes(orderId, notes)
  })

  /** Update an order's cover (guest) count. */
  ipcMain.handle('db-update-covers', (_, orderId, n) => {
    return OrderDB.updateCovers(orderId, n)
  })

  /** Add a gratuity/tip and fold it into the offline total. */
  ipcMain.handle('db-add-gratuity', (_, orderId, amount) => {
    return OrderDB.addGratuity(orderId, amount)
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
   * Marks an order as successfully synced to cloud, optionally recording
   * the cloud-allocated order number for receipt traceability.
   */
  ipcMain.handle('db-mark-order-synced', (_, orderId, cloudOrderNumber) => {
    OrderDB.markSynced(orderId, cloudOrderNumber)
    return true
  })

  /**
   * Generates the next sequential offline invoice number for an outlet
   * (device-namespaced, collision-proof against other tills and cloud).
   */
  ipcMain.handle('db-next-invoice-number', (_, outletId) => {
    return nextOfflineInvoiceNumber(OutletDB.get(outletId))
  })

  /**
   * Returns the end-of-day summary computed from local orders,
   * including the unsynced count for the EOD warning.
   */
  ipcMain.handle('db-eod-summary', (_, outletId, date) => {
    return OrderDB.eodSummary(outletId, date)
  })

  /**
   * Returns the count of orders not yet uploaded to cloud.
   */
  ipcMain.handle('db-unsynced-count', () => {
    return OrderDB.getUnsyncedCount()
  })

  // ── LOCAL DB: CUSTOMERS ───────────────────────────────────────
  /**
   * Searches cached customers by name or phone for offline POS attach.
   */
  ipcMain.handle('db-search-customers', (_, outletId, query) => {
    return CustomerDB.search(outletId, query)
  })

  /**
   * Creates a walk-in customer locally and queues it for cloud sync.
   */
  ipcMain.handle('db-create-customer', (_, data) => {
    return CustomerDB.createLocal(data)
  })

  /**
   * Bulk-saves customers from a cloud sync payload (lookup cache).
   */
  ipcMain.handle('db-save-customers-sync', (_, customers) => {
    CustomerDB.saveFromSync(customers)
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

  /**
   * Returns the outlet's active KOTs shaped like the cloud /kitchen/kots row,
   * so the offline Kitchen Display renders identically to online.
   */
  ipcMain.handle('db-get-kitchen-kots', (_, outletId) => {
    return KotDB.getActiveForOutlet(outletId)
  })

  /**
   * Updates a KOT's status (pending → ready → completed) for the offline KDS.
   */
  ipcMain.handle('db-update-kot-status', (_, kotId, status) => {
    return KotDB.updateKotStatus(kotId, status)
  })

  /**
   * Updates a single KOT line item's status (ready/served) for the offline KDS.
   */
  ipcMain.handle('db-update-kot-item-status', (_, kotId, itemId, status) => {
    return KotDB.updateKotItemStatus(kotId, itemId, status)
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

  // ── LOCAL DB: GENERIC WRITE OUTBOX ────────────────────────────
  /**
   * Enqueues a failed offline write (raw axios request) for later replay by
   * SyncEngine.drainOutbox(). The frontend offlineWrite() helper calls this
   * whenever a mutation hits a network error while running in Electron.
   * @param {{ uuid?: string, method: string, url: string, body?: any }} rec
   */
  ipcMain.handle('db-outbox-enqueue', (_, rec) => {
    return OutboxDB.enqueue(rec)
  })

  /**
   * Returns the count of offline writes still awaiting replay (status bar).
   */
  ipcMain.handle('db-outbox-pending-count', () => {
    return OutboxDB.pendingCount()
  })

  // ── LOCAL DB: DIAGNOSTICS ─────────────────────────────────────
  /**
   * Returns the path to the local SQLite database file.
   */
  ipcMain.handle('db-get-path', () => {
    return getDBPath()
  })

  /**
   * Returns the stable 4-char device id used to namespace offline numbers.
   */
  ipcMain.handle('db-get-device-id', () => {
    return getDeviceId()
  })

  // ── LOCAL DB: OUTLET ─────────────────────────────────────────
  ipcMain.handle('db-get-outlet', (_, outletId) => {
    return OutletDB.get(outletId)
  })

  // ── BROWSER PRINT FALLBACK ────────────────────────────────────
  /**
   * Opens a minimal BrowserWindow with rendered HTML receipt for
   * PDF/paper printing when no thermal printer is configured.
   * @param {object} html - { html: string, title: string }
   */
  ipcMain.handle('print-receipt-html', async (_, { html, title }) => {
    try {
      const printWin = new BrowserWindow({
        width: 400,
        height: 700,
        show: false,
        webPreferences: { contextIsolation: true },
        title: title || 'Receipt',
      })
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      printWin.show()
      printWin.webContents.print({ silent: false, printBackground: true }, (success) => {
        if (!printWin.isDestroyed()) printWin.close()
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
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
  // Use console as logger (electron-log is optional)
  const log = { info: console.log, error: console.error, warn: console.warn }

  log.info(`[AutoUpdater] Current version: ${app.getVersion()}`)
  log.info(`[AutoUpdater] isDev: ${isDev}, isPackaged: ${app.isPackaged}`)

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // macOS in-place auto-update requires a paid Apple Developer ID signature.
  // This build is only ad-hoc signed (afterSign.js: `codesign --sign -`), so
  // Squirrel.Mac refuses to apply a downloaded update on restart — the app
  // quits but never swaps in the new version, reopening the SAME old build.
  // To avoid dead-ending Mac users at a "Restart" button that does nothing, we
  // send them to the releases page to download the new DMG and drag-install.
  // Windows (NSIS) applies updates fine without signing, so it keeps the real
  // silent download + quitAndInstall flow below.
  const isMac = process.platform === 'darwin'
  const RELEASES_PAGE = 'https://github.com/sunnnyak47/petpooja-saas/releases/latest'

  // Force the correct GitHub provider config
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'sunnnyak47',
    repo: 'petpooja-saas',
    releaseType: 'release',
  })

  autoUpdater.on('checking-for-update', () => {
    log.info('[AutoUpdater] Checking for updates...')
    notifyRenderer('update-status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`[AutoUpdater] Update available: v${info.version}`)
    notifyRenderer('update-status', { status: 'available', version: info.version })

    if (isMac) {
      // No working silent install on an ad-hoc-signed macOS app — direct the
      // user to download the DMG and drag-install instead.
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Available',
          message: `Version ${info.version} is available!`,
          detail:
            `You're running v${app.getVersion()}. Click "Download Update" to get the new installer, ` +
            `then drag "MS-RM System" into Applications (replace the old copy) and reopen it.`,
          buttons: ['Download Update', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            log.info('[AutoUpdater] macOS: opening releases page for manual download')
            shell.openExternal(RELEASES_PAGE)
          }
        })
      return
    }

    // Windows: real silent download + install.
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available!`,
        detail: `You are running v${app.getVersion()}. Download now to get the latest features and bug fixes.`,
        buttons: ['Download Now', 'Later'],
      })
      .then(({ response }) => {
        if (response === 0) {
          log.info('[AutoUpdater] User clicked Download Now')
          autoUpdater.downloadUpdate()
          notifyRenderer('update-downloading', { version: info.version })
        }
      })
  })

  autoUpdater.on('update-not-available', (info) => {
    log.info(`[AutoUpdater] App is up to date (latest: v${info?.version || 'unknown'})`)
    notifyRenderer('update-status', { status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent)
    log.info(`[AutoUpdater] Download progress: ${pct}%`)
    notifyRenderer('update-progress', {
      percent: pct,
      transferred: progress.transferred,
      total: progress.total,
      speed: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[AutoUpdater] Update downloaded: v${info.version}`)
    notifyRenderer('update-ready', { version: info.version })
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart to apply?`,
        buttons: ['Restart Now', 'Later'],
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true)
        }
      })
  })

  autoUpdater.on('error', (err) => {
    log.error(`[AutoUpdater] Error: ${err.message}`)
    log.error(`[AutoUpdater] Stack: ${err.stack}`)
    notifyRenderer('update-status', { status: 'error', error: err.message })
  })

  // IPC handler for manual update check from renderer
  ipcMain.handle('check-for-updates', async () => {
    try {
      log.info('[AutoUpdater] Manual check triggered')
      const result = await autoUpdater.checkForUpdates()
      return { success: true, version: result?.updateInfo?.version }
    } catch (err) {
      log.error(`[AutoUpdater] Manual check failed: ${err.message}`)
      return { success: false, error: err.message }
    }
  })

  // Check on launch (both dev & prod) — 5s after ready, then every 30 min
  setTimeout(() => {
    log.info('[AutoUpdater] Initial update check...')
    autoUpdater.checkForUpdates().catch((err) => {
      log.error(`[AutoUpdater] Initial check failed: ${err.message}`)
    })
  }, 5000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000)
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
  // Region + amount normalisation. The OFFLINE biller passes a local order row
  // (total_amount / cgst_amount / sgst_amount / tax_amount) which may be an AU
  // outlet, while the cloud bill uses grand_total / cgst / sgst. Read both, and
  // detect AU so we print a single 'GST (10%)' line in A$ instead of Indian
  // CGST/SGST in ₹.
  const o = bill.outlet || {}
  const isAU = o.country_code === 'AU' || o.region === 'AU'
    || o.currency === 'AUD' || bill.currency === 'AUD'
  const sym = isAU ? 'A$' : 'Rs'
  const subtotalAmt = bill.subtotal ?? 0
  const cgstAmt = bill.cgst ?? bill.cgst_amount ?? 0
  const sgstAmt = bill.sgst ?? bill.sgst_amount ?? 0
  const taxAmt = bill.tax_amount ?? bill.igst ?? (cgstAmt + sgstAmt)
  const grandTotal = bill.grand_total ?? bill.total_amount ?? 0

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
    // Use the stored line_total (already includes addons) rather than
    // unit_price × qty, which drops addon money from the printed amount.
    const lineTotal = (item.line_total ?? item.total_price
      ?? ((item.unit_price || 0) * (item.quantity || 1))).toFixed(2)
    printer.tableCustom([
      { text: item.name, align: 'LEFT', width: 0.55 },
      { text: `${item.quantity}x`, align: 'CENTER', width: 0.1 },
      { text: `${sym}${lineTotal}`, align: 'RIGHT', width: 0.35 },
    ])
  })

  printer.drawLine()
  printer.tableCustom([
    { text: 'Subtotal', align: 'LEFT', width: 0.6 },
    { text: `${sym}${(subtotalAmt || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
  ])
  if (isAU) {
    // AU: single inclusive GST line, no CGST/SGST split.
    printer.tableCustom([
      { text: 'GST (10%)', align: 'LEFT', width: 0.6 },
      { text: `${sym}${(taxAmt || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
    ])
  } else {
    printer.tableCustom([
      { text: 'CGST', align: 'LEFT', width: 0.6 },
      { text: `${sym}${(cgstAmt || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
    ])
    printer.tableCustom([
      { text: 'SGST', align: 'LEFT', width: 0.6 },
      { text: `${sym}${(sgstAmt || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
    ])
  }
  if (bill.service_charge) {
    printer.tableCustom([
      { text: 'Service Charge', align: 'LEFT', width: 0.6 },
      { text: `${sym}${(bill.service_charge || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
    ])
  }
  printer.bold(true)
  printer.tableCustom([
    { text: 'TOTAL', align: 'LEFT', width: 0.6 },
    { text: `${sym}${(grandTotal || 0).toFixed(2)}`, align: 'RIGHT', width: 0.4 },
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
app.whenReady().then(async () => {
  // In production, start a local HTTP server to serve the bundled frontend.
  // This gives the renderer an http://127.0.0.1 origin, which Google's
  // Web Speech API accepts — fixing the "network" error in Voice POS.
  if (!isDev) {
    const frontendDir = path.join(process.resourcesPath, 'frontend')
    try {
      const port = await startLocalFrontendServer(frontendDir)
      FRONTEND_URL = `http://127.0.0.1:${port}`
    } catch (err) {
      // Fallback to app:// if the local server fails for any reason
      console.error('[LocalServer] Falling back to app:// protocol:', err.message)
      FRONTEND_URL = 'app://index/index.html'
      protocol.registerFileProtocol('app', (request, callback) => {
        const fs = require('fs')
        let filePath = request.url.replace('app://index/', '')
        filePath = decodeURIComponent(filePath.split('?')[0].split('#')[0])
        const fullPath = path.join(frontendDir, filePath)
        if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
          callback({ path: path.join(frontendDir, 'index.html') })
        } else {
          callback({ path: fullPath })
        }
      })
    }
  }

  setupMediaPermissions()
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
  fetch(`${store.get('apiUrl') || 'https://petpooja-saas.onrender.com'}/health`)
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

// Clean up local HTTP server on exit
app.on('before-quit', () => {
  if (localServer) {
    localServer.close(() => console.log('[LocalServer] Stopped'))
  }
})

// Security: prevent any new window from opening (open in browser instead)
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
})
