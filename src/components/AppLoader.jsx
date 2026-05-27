import React, { useEffect, useState } from 'react';

// ConveGenius brand asset (matches Phase 4 Login + Phase 5.5 AccessDenied).
// Served from /public/assets — no third-party network dependency.
const BRAND_LOGO_URL = '/assets/cg-logo.png';

const SLOW_MS = 4000;
const STALE_MS = 12000;

const spinKeyframes = `
@keyframes appLoaderSpin { to { transform: rotate(360deg); } }
@keyframes appLoaderPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
`;

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    background: 'var(--bg-1, #fafafa)',
    color: 'var(--text-1, #222)',
    fontFamily: "'Outfit', system-ui, -apple-system, sans-serif"
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
    maxWidth: 360,
    width: '100%',
    textAlign: 'center'
  },
  logo: {
    width: 56,
    height: 56,
    objectFit: 'contain',
    animation: 'appLoaderPulse 1.8s ease-in-out infinite'
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid var(--border-1, rgba(0,0,0,0.08))',
    borderTopColor: 'var(--accent, #5b6cff)',
    borderRadius: '50%',
    animation: 'appLoaderSpin 0.9s linear infinite'
  },
  title: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '0.01em'
  },
  subtitle: {
    margin: 0,
    fontSize: '0.85rem',
    color: 'var(--text-3, #6b7280)',
    lineHeight: 1.5
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.55rem 1.1rem',
    borderRadius: 8,
    border: '1px solid var(--border-1, rgba(0,0,0,0.12))',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
    fontFamily: 'inherit'
  }
};

/**
 * Branded full-page loader used during:
 *   - AuthContext bootstrap (initial /me probe)
 *   - Route-level Suspense fallback for lazy chunks
 *
 * Surfaces a recovery affordance if the wait exceeds STALE_MS so the user is
 * never stuck on a blank "Loading…" screen — they always have a reload button.
 *
 * `title` defaults differ by call site:
 *   - Auth bootstrap with a persisted session  → "Restoring your session…"
 *   - Auth bootstrap without a session         → "Loading…"
 *   - Suspense (lazy route)                    → "Loading…"
 */
const AppLoader = ({
  title = 'Loading…',
  subtitle,
  onRetry,
  showLogo = true,
  testId = 'app-loader'
}) => {
  const [phase, setPhase] = useState('initial'); // initial | slow | stale

  useEffect(() => {
    const slow = setTimeout(() => setPhase((p) => (p === 'initial' ? 'slow' : p)), SLOW_MS);
    const stale = setTimeout(() => setPhase('stale'), STALE_MS);
    return () => {
      clearTimeout(slow);
      clearTimeout(stale);
    };
  }, []);

  const message =
    phase === 'stale'
      // Free-tier hosting note: Render Free sleeps after ~15 min of
      // inactivity and a cold container can take up to about a minute to
      // come back. Telling the user this up front prevents the "is it
      // broken?" worry without making the UI feel broken.
      ? 'The backend may be waking up. On the free hosting tier this can take up to about a minute. You can wait or reload.'
      : phase === 'slow'
        ? 'Still working… the backend is warming up.'
        : (subtitle || 'Please wait a moment.');

  const handleReload = () => {
    if (onRetry) return onRetry();
    if (typeof window !== 'undefined') window.location.reload();
  };

  return (
    <div style={styles.container} role="status" aria-live="polite" aria-busy="true" data-testid={testId}>
      <style>{spinKeyframes}</style>
      <div style={styles.card}>
        {showLogo && <img src={BRAND_LOGO_URL} alt="" aria-hidden="true" style={styles.logo} />}
        <div style={styles.spinner} />
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.subtitle}>{message}</p>
        {phase === 'stale' && (
          <button type="button" style={styles.button} onClick={handleReload}>
            Reload
          </button>
        )}
      </div>
    </div>
  );
};

export default AppLoader;
