import { useState, useEffect } from 'react'
import { Cloud, Check, AlertCircle, ArrowDown, ArrowUp } from 'lucide-react'

const SyncStatusIndicator = () => {
  const [syncStatus, setSyncStatus] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!window.electron) return

    const unsubscribe = window.electron.onSyncStatus((data) => {
      setSyncStatus(data)
      setVisible(true)
    })

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  // Auto-hide after completion
  useEffect(() => {
    if (syncStatus && (syncStatus.status === 'success' || syncStatus.status === 'done')) {
      const timer = setTimeout(() => setVisible(false), 3000)
      return () => clearTimeout(timer)
    }
    if (syncStatus && syncStatus.status === 'error') {
      const timer = setTimeout(() => setVisible(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [syncStatus])

  if (!syncStatus || !visible) return null

  const configs = {
    downloading: { bg: 'bg-blue-600/90', Icon: ArrowDown, spin: true },
    uploading:   { bg: 'bg-indigo-600/90', Icon: ArrowUp, spin: true },
    success:     { bg: 'bg-emerald-600/90', Icon: Check, spin: false },
    done:        { bg: 'bg-emerald-600/90', Icon: Check, spin: false },
    error:       { bg: 'bg-red-600/90', Icon: AlertCircle, spin: false },
  }

  const cfg = configs[syncStatus.status] || configs.done
  const StatusIcon = cfg.Icon

  return (
    <div className={`
      fixed bottom-4 right-4 z-[9999]
      ${cfg.bg} text-white backdrop-blur-sm
      px-4 py-2.5 rounded-xl text-xs
      font-medium shadow-lg
      flex items-center gap-2
      transition-all duration-300 ease-in-out
      ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
    `}>
      <StatusIcon className={`w-3.5 h-3.5 ${cfg.spin ? 'animate-bounce' : ''}`} />
      <span>{syncStatus.message || 'Syncing...'}</span>
    </div>
  )
}

export default SyncStatusIndicator
