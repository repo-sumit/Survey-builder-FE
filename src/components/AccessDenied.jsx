import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BRAND_LOGO = '/assets/cg-logo.png';

/**
 * Canonical reason codes that mean "you signed in successfully but the
 * backend will not grant access". Imported by the route guards so they
 * can redirect here instead of /login.
 *
 * Keep this in sync with backend/middleware/auth.js — those are the only
 * 403 codes the server returns from /api/auth/me's NOT_INVITED / INACTIVE /
 * DOMAIN_BLOCKED branches.
 */
export const ACCESS_DENIED_REASONS = ['NOT_INVITED', 'INACTIVE', 'DOMAIN_BLOCKED'];

/* Reason-specific copy. The fallback is intentionally generic so a direct
   visitor to /access-denied (no session, no reason) still sees something
   sensible and not protected data. */
const REASON_COPY = {
  NOT_INVITED: {
    title: 'Access pending',
    body: (
      <>
        Your Google sign-in worked, but your account is not authorized for{' '}
        <span className="fmb-access-strong">FMB Survey Builder</span> yet. Please contact
        your admin to request access.
      </>
    ),
  },
  INACTIVE: {
    title: 'Account inactive',
    body: (
      <>
        Your account exists but has been deactivated. Contact your admin to
        re-enable it.
      </>
    ),
  },
  DOMAIN_BLOCKED: {
    title: 'Email domain not allowed',
    body: (
      <>
        Your email domain isn't on the approved list. Please sign in with an
        approved corporate email.
      </>
    ),
  },
  __DEFAULT__: {
    title: 'Access not granted',
    body: (
      <>
        You don't have access to{' '}
        <span className="fmb-access-strong">FMB Survey Builder</span> right now.
        If you believe this is a mistake, please contact your admin.
      </>
    ),
  },
};

/* Admin contacts — names only. No email/phone is rendered until we have a
   verified contact channel. Treat this list as configuration, not as a
   data dependency. */
const ADMIN_CONTACTS = [
  { name: 'Sumit',     initials: 'SU' },
  { name: 'Satyanshu', initials: 'SA' },
];

const ShieldOffIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M3 3l18 18" />
  </svg>
);

/**
 * AccessDenied — branded "no access" landing.
 *
 * Mounted as a top-level public route. Reads the live useAuth() state and:
 *   - If the user IS authorized (user is non-null), redirects them home so
 *     they can't get stuck here.
 *   - Otherwise renders reason-specific copy from AuthContext.authReason,
 *     falling back to a generic message when there's no reason in state
 *     (i.e. someone typed /access-denied into the URL bar directly).
 *
 * Never reads protected data; never renders the sidebar/topnav shell.
 */
const AccessDenied = () => {
  const navigate = useNavigate();
  const {
    user,
    loading,
    authReason,
    hasPersistedSession,
    logout,
    clearAuthReason,
    refreshProfile,
  } = useAuth();

  const [busy, setBusy] = useState(false);

  // Authorized users must never be trapped here. We bounce them to their
  // role's home in an effect (rather than a render-time <Navigate>) so the
  // routing decision happens AFTER the auth bootstrap settles — otherwise
  // a hard refresh of /access-denied could mis-route during the brief
  // window where loading=true.
  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate(user.role === 'admin' ? '/admin' : '/', { replace: true });
    }
  }, [loading, user, navigate]);

  const handleSignOut = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // logout() already: signs out Supabase, removes sb-* keys, clears
      // sessionStorage, clears React Query cache, and zeroes authReason.
      // See AuthContext.purgeBrowserAuthArtifacts.
      await logout();
    } finally {
      setBusy(false);
      navigate('/login', { replace: true });
    }
  }, [busy, logout, navigate]);

  const handleTryAgain = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (hasPersistedSession) {
        // Defensive — AuthContext purges on access-denied reasons, so the
        // hint is normally false by the time this screen is shown. If a
        // session somehow still exists (e.g. a transient timeout case) we
        // re-run /me; success will set user and the useEffect above will
        // route the user home.
        await refreshProfile();
      } else {
        clearAuthReason();
        navigate('/login', { replace: true });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, hasPersistedSession, refreshProfile, clearAuthReason, navigate]);

  const handleBackToLogin = useCallback(() => {
    // Without clearing the reason, PublicOnlyRoute would bounce us right
    // back to /access-denied — making the button a no-op.
    clearAuthReason();
    navigate('/login', { replace: true });
  }, [clearAuthReason, navigate]);

  // While the auth bootstrap is in flight we still render the screen
  // chrome (no spinner), so a direct visitor doesn't see a blank page.
  // The useEffect handles redirecting authorized users once it settles.
  const copy = (authReason && REASON_COPY[authReason]) || REASON_COPY.__DEFAULT__;

  return (
    <div className="fmb-access-shell">
      <main className="fmb-access-card" role="main" aria-labelledby="fmb-access-title">
        <header className="fmb-access-brandbar">
          <img src={BRAND_LOGO} alt="" />
          <div>
            <div className="fmb-access-brand-name">FMB Survey Builder</div>
            <div className="fmb-access-brand-sub">a ConveGenius product</div>
          </div>
        </header>

        <div className="fmb-access-icon" aria-hidden="true">
          <ShieldOffIcon />
        </div>

        <div>
          <div className="fmb-access-eyebrow">Access status</div>
          <h1 id="fmb-access-title" className="fmb-access-title">{copy.title}</h1>
        </div>

        <p className="fmb-access-body" role="status" data-testid="access-denied-body">
          {copy.body}
        </p>

        <section className="fmb-access-contacts" aria-labelledby="fmb-access-contacts-title">
          <div id="fmb-access-contacts-title" className="fmb-access-contacts-title">
            Contact your admin to request access
          </div>
          <div className="fmb-access-contacts-list" data-testid="access-denied-contacts">
            {ADMIN_CONTACTS.map((c) => (
              <span key={c.name} className="fmb-access-contact">
                <span className="fmb-avatar" aria-hidden="true">{c.initials}</span>
                {c.name}
              </span>
            ))}
          </div>
        </section>

        <div className="fmb-access-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleBackToLogin}
            disabled={busy}
            data-testid="access-denied-back"
          >
            Back to login
          </button>
          <div className="fmb-access-spacer" />
          <button
            type="button"
            className="btn"
            onClick={handleTryAgain}
            disabled={busy}
            data-testid="access-denied-retry"
          >
            {busy ? 'Working…' : 'Try again'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSignOut}
            disabled={busy}
            data-testid="access-denied-signout"
          >
            Sign out
          </button>
        </div>

        <p className="fmb-access-footer">Built for ConveGenius</p>
      </main>
    </div>
  );
};

export default AccessDenied;
