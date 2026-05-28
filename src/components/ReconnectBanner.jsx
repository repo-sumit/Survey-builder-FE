import React from 'react';
import { useAuth, AUTH_WARNINGS } from '../contexts/AuthContext';

/**
 * Non-blocking reconnect banner.
 *
 * Renders ONLY when AuthContext is in the stale-while-revalidate
 * "reconnecting" state — i.e. we have a cached verified user, the app
 * shell is live, but the background `/api/auth/me` revalidation hit a
 * transient failure (timeout / 5xx / network).
 *
 * This is purely informational + a Retry affordance. It deliberately
 * does NOT block the user's view. Backend RBAC still applies on every
 * protected request; if a mutation lands while the BE is genuinely
 * down, the per-request error will surface in the existing toast flow
 * (which the calling component already owns).
 *
 * Mounted inside AppShell so it sits above the main content pane for
 * every protected route. Renders null when there's nothing to warn about,
 * so it's safe to leave in the tree permanently.
 */
const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.55rem 1rem',
    background: 'var(--warning-bg, #fff7e6)',
    borderBottom: '1px solid var(--warning-border, #f0c97a)',
    color: 'var(--warning-fg, #5a3b00)',
    fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
    fontSize: '0.85rem',
    lineHeight: 1.4
  },
  dot: {
    flex: '0 0 auto',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--warning-fg, #5a3b00)',
    opacity: 0.7
  },
  message: { flex: '1 1 auto' },
  actions: { display: 'flex', gap: '0.4rem', flex: '0 0 auto' },
  button: {
    border: '1px solid var(--warning-border, #f0c97a)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    padding: '0.25rem 0.7rem',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: '0.8rem',
    fontFamily: 'inherit'
  }
};

const ReconnectBanner = () => {
  const { authWarning, isRevalidating, retryBoot, dismissAuthWarning } = useAuth();
  if (authWarning !== AUTH_WARNINGS.RECONNECTING) return null;

  const handleRetry = (e) => {
    e.preventDefault();
    if (!isRevalidating) retryBoot();
  };
  const handleDismiss = (e) => {
    e.preventDefault();
    dismissAuthWarning();
  };

  return (
    <div
      style={styles.bar}
      role="status"
      aria-live="polite"
      data-testid="reconnect-banner"
    >
      <span style={styles.dot} aria-hidden="true" />
      <span style={styles.message}>
        Backend is reconnecting. You can keep viewing the app; saving may be temporarily unavailable.
      </span>
      <span style={styles.actions}>
        <button
          type="button"
          style={styles.button}
          onClick={handleRetry}
          disabled={isRevalidating}
          data-testid="reconnect-banner-retry"
        >
          {isRevalidating ? 'Retrying…' : 'Retry'}
        </button>
        <button
          type="button"
          style={styles.button}
          onClick={handleDismiss}
          data-testid="reconnect-banner-dismiss"
        >
          Dismiss
        </button>
      </span>
    </div>
  );
};

export default ReconnectBanner;
