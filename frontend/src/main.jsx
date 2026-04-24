import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './themes/ThemeContext';
import App from './App';
import { store } from './store';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
  },
});

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

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <RootErrorBoundary>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
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
        </QueryClientProvider>
      </Provider>
    </RootErrorBoundary>
  );
}
