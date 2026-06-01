import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

const BRAND_LOGO = '/assets/cg-logo.png';

/* AuthContext can set authReason to any of these codes when /me rejects
   or the bootstrap times out. The Login screen surfaces a banner so the
   user understands WHY they were sent back to /login. Keep in sync with
   `purgeBrowserAuthArtifacts` + `resolveProfile` in AuthContext.jsx. */
const REASON_MESSAGES = {
  NOT_INVITED:   'Your Google account is not invited. Ask an admin to invite you by email.',
  INACTIVE:      'Your account is inactive. Contact an admin to reactivate it.',
  DOMAIN_BLOCKED:'This email domain is not allowed. Use an approved corporate email.',
  BOOT_TIMEOUT:  "We couldn't reach the server in time. The backend may be warming up — please try again."
};

/* Inline multi-color Google glyph — preserved from the previous Login
   so the call-to-action is instantly recognizable. */
const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.2C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.2C41.4 35.2 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"/>
  </svg>
);

const WarnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

// Warmup status copy is intentionally calm and short. We deliberately
// stay silent until ~3s because most warm boots finish faster than that
// and any transient copy would just be visual noise / layout churn.
const WARMUP_SLOW_THRESHOLD_MS = 3000;
const WARMUP_READY_FADE_MS = 1500;

const Login = () => {
  const [error, setError] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // 'idle' | 'warming' | 'slow' | 'ready' | 'failed'
  const [warmupStatus, setWarmupStatus] = useState('idle');
  const { loginWithGoogle, isSupabaseConfigured, authReason, clearAuthReason } = useAuth();

  // Fire a fast /api/health probe so the backend wakes up while the user
  // is reading the page. This was preserved exactly from the previous
  // Login — do not remove (see ADR 0001 §5). The Google CTA is NEVER
  // gated on this; status copy is screen-reader-friendly via aria-live.
  useEffect(() => {
    let cancelled = false;
    setWarmupStatus('warming');

    // After the slow threshold, surface gentle copy IFF still pending.
    const slowTimer = setTimeout(() => {
      if (cancelled) return;
      setWarmupStatus((s) => (s === 'warming' ? 'slow' : s));
    }, WARMUP_SLOW_THRESHOLD_MS);

    let fadeTimer;
    authAPI.warmup()
      .then(() => {
        if (cancelled) return;
        setWarmupStatus('ready');
        // Auto-fade the "ready" copy so it doesn't linger on the page.
        fadeTimer = setTimeout(() => {
          if (!cancelled) setWarmupStatus('idle');
        }, WARMUP_READY_FADE_MS);
      })
      .catch(() => {
        if (cancelled) return;
        setWarmupStatus('failed');
      });

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      clearTimeout(fadeTimer);
    };
  }, []);

  // Resolve which copy to render. 'warming' (< slow threshold) intentionally
  // returns null to avoid layout shift on snap-fast paths — the wrapper
  // element below still reserves vertical space.
  let warmupCopy = null;
  if (warmupStatus === 'slow') warmupCopy = 'Preparing your secure workspace…';
  else if (warmupStatus === 'ready') warmupCopy = 'Workspace is ready.';
  else if (warmupStatus === 'failed') warmupCopy = "Backend may wake after sign-in; we'll keep trying.";

  const handleGoogle = async () => {
    setError(null);
    clearAuthReason();
    try {
      setGoogleLoading(true);
      await loginWithGoogle();
      // The browser redirects through Supabase → Google → back to this app;
      // when it returns, AuthContext.onAuthStateChange triggers /me + setUser.
    } catch (err) {
      setError(err?.message || 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  };

  const reasonBanner = authReason ? REASON_MESSAGES[authReason] : null;
  // If we don't recognize the reason code, we still want the user to know
  // something went wrong rather than rendering a silent empty banner.
  const fallbackBanner = authReason && !reasonBanner
    ? "We couldn't complete sign-in. Please try again."
    : null;

  return (
    <div className="fmb-login-shell" role="main">
      <section className="fmb-login-form-side">
        <div className="fmb-login-card">
          <header className="fmb-login-brandbar">
            <img src={BRAND_LOGO} alt="" />
            <div>
              <div className="fmb-login-brandbar-name">FMB Survey Builder</div>
              <div className="fmb-login-brandbar-sub">a ConveGenius product</div>
            </div>
          </header>

          <div>
            <div className="fmb-login-eyebrow">Sign in</div>
            <h1 className="fmb-login-title">Welcome back.</h1>
            <p className="fmb-login-sub">
              Use your invited Google account to continue. Access is managed by your state coordinator.
            </p>
          </div>

          {(reasonBanner || fallbackBanner) && (
            <div className="fmb-login-banner" role="alert" data-testid="login-auth-reason">
              <WarnIcon />
              <div>{reasonBanner || fallbackBanner}</div>
            </div>
          )}

          {error && (
            <div className="fmb-login-banner error" role="alert" data-testid="login-error">
              <WarnIcon />
              <div>{error}</div>
            </div>
          )}

          {isSupabaseConfigured ? (
            <button
              type="button"
              className="fmb-login-google"
              onClick={handleGoogle}
              disabled={googleLoading}
              aria-busy={googleLoading}
              data-testid="login-google-button"
            >
              <GoogleIcon />
              {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>
          ) : (
            <div className="fmb-login-banner error" role="alert">
              <WarnIcon />
              <div>
                Google sign-in is not configured. Set <code>REACT_APP_SUPABASE_URL</code> and{' '}
                <code>REACT_APP_SUPABASE_ANON_KEY</code> and reload.
              </div>
            </div>
          )}

          {/* Reserved-height status line. Always rendered so copy
              appearing/disappearing never shifts the layout. aria-live
              ensures screen readers announce the slow/ready/failed copy
              without us having to focus-jump. */}
          <div
            className={`fmb-login-warmup is-${warmupStatus}`}
            role="status"
            aria-live="polite"
            data-testid="login-warmup-status"
            // Inline-style reserves the row's vertical footprint regardless
            // of App.css being patched. Keeps the slice self-contained and
            // guarantees zero layout shift when copy appears/disappears.
            style={{
              minHeight: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
              color: 'rgba(60, 60, 67, 0.65)',
              marginTop: '0.5rem',
            }}
          >
            {warmupCopy && (
              <>
                <span
                  className="fmb-login-warmup-dot"
                  aria-hidden="true"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: warmupStatus === 'failed'
                      ? 'rgba(180, 90, 60, 0.7)'
                      : warmupStatus === 'ready'
                        ? 'rgba(60, 160, 90, 0.75)'
                        : 'rgba(120, 120, 130, 0.55)',
                    animation: warmupStatus === 'slow'
                      ? 'fmb-login-warmup-pulse 1.6s ease-in-out infinite'
                      : 'none',
                  }}
                />
                <span className="fmb-login-warmup-text">{warmupCopy}</span>
              </>
            )}
          </div>

          <p className="fmb-login-help">Need access? Contact Sumit/Satyanshu.</p>

          <div className="fmb-login-footer">Built for ConveGenius</div>
        </div>
      </section>

      <aside className="fmb-login-brand-side" aria-hidden="true">
        <div className="fmb-login-brand-top">
          <span>FMB Program</span>
          <span className="dot" />
          <span>Internal use only</span>
        </div>

        <div className="fmb-login-brand-copy">
          <h2 className="fmb-login-brand-headline">
            Author one survey.<br />
            <span className="accent">Reach ten languages.</span>
          </h2>
          <p className="fmb-login-brand-lede">
            Build, translate and preview field surveys for FMB programs — with
            schema-driven validation, branching logic, and Excel round-trips.
          </p>
        </div>

        <div className="fmb-login-brand-tag">
          <span>ConveGenius · Survey Builder</span>
        </div>

        {/* Decorative grid + radial glow — keeps the panel from feeling
            flat. Pointer-events disabled so they don't block the form on
            wider screens where the panel sits next to the card. */}
        <svg className="fmb-login-brand-grid" width="100%" height="100%" aria-hidden="true">
          <defs>
            <pattern id="fmb-login-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0v40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#fmb-login-grid)" />
        </svg>
        <div className="fmb-login-brand-glow" />
      </aside>
    </div>
  );
};

export default Login;
