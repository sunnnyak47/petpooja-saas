/**
 * OnlineStatusBar — Global Offline Notice Banner
 *
 * Renders a fixed amber banner at the very top of the viewport
 * when internet connectivity is lost. Automatically hides when
 * connection is restored.
 *
 * Works in both Electron desktop and browser environments
 * via the useOnlineStatus hook.
 */
import { useOnlineStatus } from '../hooks/useOnlineStatus'

const OnlineStatusBar = () => {
  const isOnline = useOnlineStatus()

  // Only renders when offline — invisible overhead when online
  if (isOnline) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999]
                 flex items-center justify-center gap-3
                 py-2 px-4 text-sm font-black
                 uppercase tracking-widest
                 shadow-lg"
      style={{
        background: '#f59e0b',
        color: '#000000',
      }}
    >
      <span className="animate-pulse text-base">🔴</span>
      <span>
        OFFLINE MODE — POS &amp; KOT working normally.
        Online orders &amp; payments paused.
      </span>
      <span className="animate-pulse text-base">🔴</span>
    </div>
  )
}

export default OnlineStatusBar
