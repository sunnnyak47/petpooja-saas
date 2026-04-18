const { 
  OrderDB, KotDB, TableDB, 
  MenuDB, SyncDB, SettingsDB 
} = require('../database/localDB')
const { app, BrowserWindow } = require('electron')

// We will use the production backend URL for Sync, ideally configurable via setting or env
const API_URL = 'https://petpooja-backend.onrender.com/api'

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
    const unsyncedOrders = OrderDB.getUnsyncedOrders()
    
    if (unsyncedOrders.length === 0) {
      this.isSyncing = false
      return
    }

    this.notifyRenderer('sync-status', {
      status: 'uploading',
      message: `Syncing ${unsyncedOrders.length} orders...`
    })

    let synced = 0
    let failed = 0

    for (const order of unsyncedOrders) {
      try {
        // Get order items
        const items = OrderDB.getById(
          order.id
        )?.items || []
        
        // Upload to cloud API
        const res = await fetch(
          `${API_URL}/orders/sync`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...this.getHeaders() 
            },
            body: JSON.stringify({
              order: order,
              items: items,
              source: 'offline_sync'
            })
          }
        )

        if (res.ok) {
          OrderDB.markSynced(order.id)
          synced++
        } else {
          failed++
        }
      } catch (err) {
        failed++
        console.error(
          `Failed to sync order ${order.id}:`, err
        )
      }
    }

    this.isSyncing = false
    this.lastSync = new Date()

    this.notifyRenderer('sync-status', {
      status: 'done',
      message: `Synced: ${synced}, Failed: ${failed}`,
      synced,
      failed,
    })
  }

  // ─────────────────────────────
  // FULL SYNC
  // ─────────────────────────────
  async syncAll(outletId) {
    if (!this.isOnline) return
    
    // We get outlet_id dynamically from Settings to allow full background sync without args
    const currentOutletId = outletId || SettingsDB.get('outlet_id')

    await this.uploadPendingOrders()
    
    if (currentOutletId) {
      await this.downloadFromCloud(currentOutletId)
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
