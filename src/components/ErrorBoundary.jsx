import React from 'react';

/**
 * Catches render-time and lazy-chunk-load failures from descendants.
 *
 * The fallback offers two recovery paths:
 *   - "Try again" resets the boundary and re-renders the subtree.
 *   - "Reload page" does a hard refresh — required after a stale lazy-chunk
 *     hash mismatch (which can otherwise loop on "try again").
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => this.setState({ hasError: false, error: null });
  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const detail = this.state.error?.message || '';
      const isChunkError = /loading chunk|chunkloaderror|dynamically imported module/i.test(detail);
      return (
        <div
          role="alert"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: '60vh', gap: '1rem', padding: '2rem', color: 'var(--text-2, #333)'
          }}
        >
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-3, #666)', maxWidth: 420, textAlign: 'center', margin: 0 }}>
            {isChunkError
              ? 'The page assets are out of date. Reloading should fix this.'
              : 'An unexpected error occurred. You can retry, or reload the page if the problem persists.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={this.handleReset} className="btn btn-secondary">Try again</button>
            <button onClick={this.handleReload} className="btn btn-primary">Reload page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
