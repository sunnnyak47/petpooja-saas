import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './themes/ThemeContext';
import App from './App';
import { store } from './store';
import { queryClient, persistOptions, IS_ELECTRON } from './lib/queryPersist';
import './index.css';

// Mark <body> when running inside Electron so CSS can add traffic-light safe area
if (typeof window !== 'undefined' &&
    (window.electron || window.location?.protocol === 'app:' ||
     window.location?.protocol === 'file:' || window.location?.hostname === '127.0.0.1')) {
  document.body.classList.add('is-electron', 'is-mac-electron');
}

// Tie React Query's online state to REAL backend reachability — but ONLY in Electron.
// The Electron main process runs a TCP-based connectivity check against the backend,
// so RQ pauses queries/mutations when the BACKEND (not just wifi) is unreachable and
// auto-resumes when it returns. On the web we intentionally leave RQ's default
// navigator.onLine behavior untouched, so online semantics are unchanged there.
if (typeof window !== 'undefined' && window.electron) {
  onlineManager.setEventListener((setOnline) => {
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.getOnlineStatus?.()
        .then((o) => setOnline(!!o))
        .catch(() => {});
      const unsub = window.electron.onConnectivityChange?.(({ online }) => setOnline(!!online));
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
    return () => {};
  });
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, background: '#0f172a', color: '#f8fafc', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#f04438', fontSize: 24, marginBottom: 16 }}>App Error</h1>
          <pre style={{ background: '#1e293b', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#fbbf24' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: 24, padding: '10px 20px', background: '#f04438', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
          >
            Clear Storage &amp; Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Identical provider children for both the Electron and web paths — the ONLY
// difference is which QueryClient provider wraps them.
const appTree = (
  <ThemeProvider>
    <HashRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: { background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '12px' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error: { iconTheme: { primary: '#f04438', secondary: '#fff' } },
        }}
      />
    </HashRouter>
  </ThemeProvider>
);

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <RootErrorBoundary>
      <Provider store={store}>
        {IS_ELECTRON ? (
          // Desktop only: persist the whole React Query cache to IndexedDB and,
          // once restored, flush paused mutations + invalidate to reconcile.
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={persistOptions}
            onSuccess={() => {
              queryClient.resumePausedMutations().then(() => {
                queryClient.invalidateQueries();
              });
            }}
          >
            {appTree}
          </PersistQueryClientProvider>
        ) : (
          // Web: plain provider — no IndexedDB persistence, no invalidate-on-restore,
          // so the browser app behaves exactly as it did before the offline work.
          <QueryClientProvider client={queryClient}>
            {appTree}
          </QueryClientProvider>
        )}
      </Provider>
    </RootErrorBoundary>
  );
}
