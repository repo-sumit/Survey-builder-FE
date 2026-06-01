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
    maxWidth: 380,
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
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '0.5rem',
    marginTop: '0.5rem'
  },
  button: {
    padding: '0.55rem 1.1rem',
    borderRadius: 8,
    border: '1px solid var(--border-1, rgba(0,0,0,0.12))',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
    fontFamily: 'inherit'
  },
  buttonPrimary: {
    borderColor: 'var(--accent, #5b6cff)',
    color: 'var(--accent, #5b6cff)'
  }
};

/**
 * Branded full-page loader used during:
 *   - AuthContext bootstrap (initial /me probe)
 *   - Route-level Suspense fallback for lazy chunks
 *   - AuthContext recovery state (mode="recovery")
 *
 * Two modes:
 *   - mode="loading" (default): pure spinner that automatically progresses
 *     through copy phases (initial → slow → stale) and surfaces a Reload
 *     affordance at STALE_MS so the user is never stuck on a blank
 *     "Loading…" screen.
 *   - mode="recovery": no spinner, no progressive copy. Immediately shows
 *     the recovery title/subtitle and all three actions (Retry / Sign out
 *     / Reload). Used by the route guards when AuthContext has settled
 *     into a recoverable state (BOOT_TIMEOUT / ERROR) so the user can
 *     re-attempt the boot without losing their session.
 *
 * Recovery-mode actions:
 *   - onRetry:   ideally calls AuthContext.retryBoot — re-runs warmup + /me
 *                without forcing a page reload, keeping the Supabase session.
 *   - onSignOut: ideally calls AuthContext.logout — purges sb-* + navigates
 *                to /login. The escape hatch when Retry has stopped helping.
 *   - onReload:  full-page reload (default: window.location.reload()).
 *                Last-resort affordance for the user.
 *
 * `title` defaults differ by call site:
 *   - Auth bootstrap with a persisted session  → "Restoring your session…"
 *   - Auth bootstrap without a session         → "Preparing your secure workspace"
 *   - Suspense (lazy route)                    → "Loading…"
 *   - Recovery                                 → "We couldn't confirm your access"
 *
 * `hasPersistedSession` switches the initial-phase copy between the two
 * auth-bootstrap variants. Pass-through from AuthContext so the loader
 * tells the right story: returning users see "restoring", first-time
 * mounts see "preparing". The hint is best-effort UX only — it never
 * influences gating or trust.
 */
const AppLoader = ({
  title,
  subtitle,
  mode = 'loading',
  hasPersistedSession = false,
  onRetry,
  onSignOut,
  onReload,
  showLogo = true,
  testId = 'app-loader'
}) => {
  const [phase, setPhase] = useState('initial'); // initial | slow | stale
  const [retrying, setRetrying] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    // The phase progression is only relevant in loading mode. In recovery
    // mode the actions are already visible, so we skip the timers.
    if (mode !== 'loading') return undefined;
    const slow = setTimeout(() => setPhase((p) => (p === 'initial' ? 'slow' : p)), SLOW_MS);
    const stale = setTimeout(() => setPhase('stale'), STALE_MS);
    return () => {
      clearTimeout(slow);
      clearTimeout(stale);
    };
  }, [mode]);

  const isRecovery = mode === 'recovery';

  // Default title is split by hasPersistedSession so returning users get
  // session-restore copy and first-time mounts get neutral "preparing"
  // copy. Explicit `title` prop always wins (page-level Suspense passes
  // "Loading…" directly).
  const loadingDefaultTitle = hasPersistedSession
    ? 'Restoring your session…'
    : 'Preparing your secure workspace';
  const resolvedTitle =
    title || (isRecovery ? "We couldn't confirm your access" : loadingDefaultTitle);

  // Initial-phase subtitle also forks on hasPersistedSession so the
  // story matches the title. Slow/stale messages are deliberately
  // identical regardless of session state — both phases mean "backend
  // is slow", which is the same situation for either user.
  const initialSubtitle = subtitle || (
    hasPersistedSession
      ? 'Confirming your access and preparing your workspace.'
      : 'Please wait a moment.'
  );

  const message = isRecovery
    ? (subtitle ||
        'Your Google session exists, but the backend has not confirmed your access yet. ' +
        'The backend may be waking up — on the free hosting tier this can take up to about a minute.')
    : phase === 'stale'
      // Free-tier hosting note: Render Free sleeps after ~15 min of
      // inactivity and a cold container can take up to about a minute to
      // come back. Telling the user this up front prevents the "is it
      // broken?" worry without making the UI feel broken.
      ? 'The backend may be waking up. On the free hosting tier this can take up to about a minute. You can wait or reload.'
      : phase === 'slow'
        ? 'Still working… the backend is warming up.'
        : initialSubtitle;

  const handleReload = () => {
    if (onReload) return onReload();
    if (typeof window !== 'undefined') window.location.reload();
  };

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      // Best-effort: in recovery mode the loader is usually unmounted as
      // soon as AuthContext flips loading=true → user resolves. If we're
      // still mounted on a second failure, re-enable the button.
      setRetrying(false);
    }
  };

  const handleSignOut = async () => {
    if (!onSignOut || signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  // Action visibility:
  //   - In recovery mode: always show all three (Retry primary if provided).
  //   - In loading mode: keep the legacy stale-phase Reload affordance.
  const showActions = isRecovery || phase === 'stale';
  const showRetry = isRecovery && typeof onRetry === 'function';
  const showSignOut = isRecovery && typeof onSignOut === 'function';

  return (
    <div
      style={styles.container}
      role={isRecovery ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={!isRecovery}
      data-testid={testId}
      data-mode={mode}
    >
      <style>{spinKeyframes}</style>
      <div style={styles.card}>
        {showLogo && <img src={BRAND_LOGO_URL} alt="" aria-hidden="true" style={styles.logo} />}
        {!isRecovery && <div style={styles.spinner} />}
        <h2 style={styles.title}>{resolvedTitle}</h2>
        <p style={styles.subtitle}>{message}</p>
        {showActions && (
          <div style={styles.actions}>
            {showRetry && (
              <button
                type="button"
                style={{ ...styles.button, ...styles.buttonPrimary }}
                onClick={handleRetry}
                disabled={retrying}
                data-testid="app-loader-retry"
              >
                {retrying ? 'Retrying…' : 'Retry'}
              </button>
            )}
            {showSignOut && (
              <button
                type="button"
                style={styles.button}
                onClick={handleSignOut}
                disabled={signingOut}
                data-testid="app-loader-signout"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            )}
            <button
              type="button"
              style={styles.button}
              onClick={handleReload}
              data-testid="app-loader-reload"
            >
              Reload
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppLoader;
