/**
 * useOnlineStatus — Hybrid Online/Offline Detection Hook
 *
 * Works in two modes:
 * 1. Electron Desktop: Uses Electron's TCP-based connectivity check
 *    (more reliable than browser APIs — fires on actual network loss)
 * 2. Browser/Web: Falls back to navigator.onLine + window events
 *
 * @returns {boolean} isOnline — true when internet is reachable
 */
import { useState, useEffect } from 'react'

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    if (window.electron) {
      // ── Electron Mode ──────────────────────────────────────────
      // Get current status immediately
      window.electron.getOnlineStatus().then((online) => {
        setIsOnline(online)
      })

      // Subscribe to future connectivity changes
      // Returns an unsubscribe function for cleanup
      const unsubscribe = window.electron.onConnectivityChange(({ online }) => {
        setIsOnline(online)
      })

      return () => {
        if (typeof unsubscribe === 'function') unsubscribe()
      }
    } else {
      // ── Browser Mode ───────────────────────────────────────────
      setIsOnline(navigator.onLine)

      const handleOnline = () => setIsOnline(true)
      const handleOffline = () => setIsOnline(false)

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)

      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  return isOnline
}
