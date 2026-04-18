import React, { useState, useEffect } from 'react'

const SyncStatusIndicator = () => {
  const [syncStatus, setSyncStatus] = useState(null)
  
  useEffect(() => {
    if (!window.electron) return
    
    // Subscribe to sync status updates from main process
    const unsubscribe = window.electron.onSyncStatus((data) => {
      setSyncStatus(data)
    })
    
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  // Auto-clear after 5 seconds on success/done
  useEffect(() => {
    if (syncStatus && (syncStatus.status === 'success' || syncStatus.status === 'done' || syncStatus.status === 'error')) {
      const timer = setTimeout(() => {
        setSyncStatus(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [syncStatus])

  if (!syncStatus) return null

  const config = {
    downloading: { 
      color: 'bg-blue-600', icon: '⬇️' 
    },
    uploading: { 
      color: 'bg-orange-600', icon: '⬆️' 
    },
    success: { 
      color: 'bg-green-600', icon: '✅' 
    },
    error: { 
      color: 'bg-red-600', icon: '❌' 
    },
    done: { 
      color: 'bg-green-600', icon: '✅' 
    },
  }

  const style = config[syncStatus.status] || config.done

  return (
    <div className={`
      fixed bottom-4 right-4 z-[9999]
      ${style.color} text-white
      px-4 py-2 rounded-xl text-sm 
      font-medium shadow-lg
      flex items-center gap-2
      transition-opacity duration-300
    `}>
      <span>{style.icon}</span>
      {syncStatus.message}
    </div>
  )
}

export default SyncStatusIndicator
