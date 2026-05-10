/**
 * OnlineStatusBar — Polished Offline / Back-Online Notification
 *
 * Shows a slim, professional status bar when connectivity changes:
 * - Offline: subtle dark bar with status indicator
 * - Back online: brief green confirmation that auto-dismisses after 3s
 *
 * Smooth slide-down / slide-up transitions.
 */
import { useState, useEffect, useRef } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { WifiOff, Wifi, Cloud } from 'lucide-react'

const OnlineStatusBar = () => {
  const isOnline = useOnlineStatus()
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState('offline') // 'offline' | 'back-online'
  const wasOffline = useRef(false)
  const dismissTimer = useRef(null)

  useEffect(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)

    if (!isOnline) {
      // Going offline
      wasOffline.current = true
      setMode('offline')
      setVisible(true)
    } else if (wasOffline.current) {
      // Coming back online after being offline
      setMode('back-online')
      setVisible(true)
      dismissTimer.current = setTimeout(() => {
        setVisible(false)
        wasOffline.current = false
      }, 3000)
    } else {
      // Initial load while online — don't show anything
      setVisible(false)
    }

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [isOnline])

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] transition-all duration-500 ease-in-out ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      {mode === 'offline' ? (
        <div className="flex items-center justify-center gap-2 py-2 px-4"
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <WifiOff className="w-3.5 h-3.5 text-slate-300" />
          <span className="text-xs font-medium text-slate-200 tracking-wide">
            Offline — POS & KOT working normally. Orders will sync when reconnected.
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-2 px-4"
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
          </span>
          <Wifi className="w-3.5 h-3.5 text-emerald-200" />
          <span className="text-xs font-medium text-emerald-100 tracking-wide">
            Back online — syncing data
          </span>
          <Cloud className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
        </div>
      )}
    </div>
  )
}

export default OnlineStatusBar
