import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppLoader from './AppLoader';

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
  const { user, loading, hasPersistedSession } = useAuth();

  if (loading) {
    return (
      <AppLoader
        title={hasPersistedSession ? 'Restoring your session…' : 'Loading…'}
        subtitle={hasPersistedSession ? "You're already signed in — taking you to your workspace." : undefined}
        testId="public-only-route-loader"
      />
    );
  }

  if (user) {
    const target = user.role === 'admin' ? '/admin' : '/';
    return <Navigate to={target} replace />;
  }

  return children;
};

export default PublicOnlyRoute;
