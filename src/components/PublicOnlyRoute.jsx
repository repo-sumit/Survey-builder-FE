import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppLoader from './AppLoader';
import { ACCESS_DENIED_REASONS } from './AccessDenied';

/**
 * Wrap routes that should ONLY be visible to unauthenticated users (e.g. /login).
 *
 * Behavior:
 *   - While auth is bootstrapping AND we synchronously detected a persisted
 *     Supabase session in localStorage, render a "Restoring your session…"
 *     loader. This is the fix for the visual-logout flash that used to happen
 *     when an authenticated admin manually typed /login into the URL bar:
 *     instead of seeing a stripped-down "Loading…" with no app shell (which
 *     looked like a logout) they see a clearly-branded session-restore screen,
 *     and then get redirected to /admin.
 *   - While bootstrapping with NO persisted session, render the same loader
 *     with a neutral "Loading…" message — bootstrap is short in that case.
 *   - Once bootstrap settles:
 *       - If a user is present, redirect to their role's home (admin→/admin,
 *         else /). NEVER render the login form for an authed user, even for a
 *         tick — that's the source of the perceived-logout bug.
 *       - Otherwise render the children (the login form).
 */
const PublicOnlyRoute = ({ children }) => {
  const { user, loading, hasPersistedSession, authReason } = useAuth();

  if (loading) {
    // Persisted-session subtitle is bespoke ("you're already signed in") so
    // we override it here; AppLoader's default subtitle is for the auth-
    // bootstrap (Protected) flow. For the no-session case we keep an
    // explicit "Loading…" title to preserve /Loading/-style legacy tests.
    return (
      <AppLoader
        title={hasPersistedSession ? undefined : 'Loading…'}
        subtitle={hasPersistedSession ? "You're already signed in — taking you to your workspace." : undefined}
        hasPersistedSession={hasPersistedSession}
        testId="public-only-route-loader"
      />
    );
  }

  if (user) {
    const target = user.role === 'admin' ? '/admin' : '/';
    return <Navigate to={target} replace />;
  }

  // Signed-in but unauthorized users get the dedicated screen rather than
  // /login. The Login screen still carries its own banner code as a
  // defensive fallback (e.g. if someone reaches /login directly with the
  // reason already cleared, no infinite bounce can happen).
  if (ACCESS_DENIED_REASONS.includes(authReason)) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
};

export default PublicOnlyRoute;
