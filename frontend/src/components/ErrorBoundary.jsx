import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      const errorMessage = isDev
        ? this.state.error?.toString()
        : this.state.error?.message || 'An unexpected error occurred.';

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
          <div style={{
            textAlign: 'center',
            maxWidth: 480,
            padding: 32,
            borderRadius: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'color-mix(in srgb, var(--danger, #dc2626) 12%, transparent)',
              marginBottom: 20,
            }}>
              <AlertTriangle size={32} style={{ color: 'var(--danger, #dc2626)' }} />
            </div>

            <h1 style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}>
              Something went wrong
            </h1>

            <p style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              marginBottom: 24,
              lineHeight: 1.6,
            }}>
              The app hit an unexpected error. This has been logged.
              Try refreshing the page or going back to the dashboard.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 24px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  background: 'var(--accent)',
                  color: 'var(--accent-text, #fff)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  window.location.hash = '#/';
                  this.handleReset();
                }}
                style={{
                  padding: '10px 24px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'var(--bg-secondary, #fff)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                Go to Dashboard
              </button>
            </div>

            {errorMessage && (
              <pre style={{
                marginTop: 24,
                padding: 16,
                background: 'var(--bg-hover)',
                color: 'var(--danger, #dc2626)',
                borderRadius: 8,
                fontSize: 12,
                textAlign: 'left',
                overflow: 'auto',
                maxHeight: 120,
                border: '1px solid var(--border)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {errorMessage}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
