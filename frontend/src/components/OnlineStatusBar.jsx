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
import { WifiOff, Wifi, Cloud, CloudUpload } from 'lucide-react'
import hybridAPI from '../api/offlineAPI'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron

const OnlineStatusBar = () => {
  const isOnline = useOnlineStatus()
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState('offline') // 'offline' | 'back-online'
  const [pendingCount, setPendingCount] = useState(0)
  const [outboxCount, setOutboxCount] = useState(0)
  const wasOffline = useRef(false)
  const dismissTimer = useRef(null)

  // Desktop only: track local orders awaiting cloud sync AND generic offline
  // writes (menu/tables/etc.) queued in the api_outbox. Initial counts via IPC
  // on mount, a light 5s poll for the outbox, then live 'sync-status' updates.
  useEffect(() => {
    if (!IS_ELECTRON) return

    hybridAPI.getUnsyncedCount()
      .then((n) => setPendingCount(Number(n) || 0))
      .catch(() => {})

    // Generic write-outbox count (offline menu/table changes awaiting replay).
    const pollOutbox = () => {
      if (typeof window.electron.outboxPendingCount === 'function') {
        window.electron.outboxPendingCount()
          .then((n) => setOutboxCount(Number(n) || 0))
          .catch(() => {})
      }
    }
    pollOutbox()
    const outboxTimer = setInterval(pollOutbox, 5000)

    let unsubscribe
    if (window.electron.onSyncStatus) {
      unsubscribe = window.electron.onSyncStatus((data) => {
        if (typeof data?.pending === 'number') setPendingCount(data.pending)
        if (typeof data?.outbox_pending === 'number') setOutboxCount(data.outbox_pending)
      })
    }

    return () => {
      clearInterval(outboxTimer)
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

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
    <>
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

    {/* Desktop pending badges — stacked amber pills, hidden when nothing queued.
        Top: local orders awaiting cloud sync. Bottom: generic offline writes
        (menu/table changes) queued in the api_outbox. */}
    {IS_ELECTRON && (pendingCount > 0 || outboxCount > 0) && (
      <div
        className={`fixed right-3 z-[9998] flex flex-col items-end gap-2 transition-all duration-500 ease-in-out ${visible ? 'top-11' : 'top-2'}`}
      >
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 py-1.5 px-3 rounded-full shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <CloudUpload className="w-3.5 h-3.5 text-amber-200" />
            <span className="text-xs font-medium text-amber-100 tracking-wide">
              {pendingCount} order{pendingCount !== 1 ? 's' : ''} pending sync
            </span>
          </div>
        )}
        {outboxCount > 0 && (
          <div className="flex items-center gap-2 py-1.5 px-3 rounded-full shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <CloudUpload className="w-3.5 h-3.5 text-amber-200" />
            <span className="text-xs font-medium text-amber-100 tracking-wide">
              Offline — {outboxCount} change{outboxCount !== 1 ? 's' : ''} queued
            </span>
          </div>
        )}
      </div>
    )}
    </>
  )
}

export default OnlineStatusBar
