import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, AUTH_RECOVERABLE_REASONS } from '../contexts/AuthContext';
import AppLoader from './AppLoader';
import { ACCESS_DENIED_REASONS } from './AccessDenied';

/**
 * Auth-gated route guard.
 *
 * Contract (in render order):
 *   1. While AuthContext is bootstrapping → branded AppLoader.
 *   2. After settle, when there is NO user:
 *        - authReason ∈ ACCESS_DENIED_REASONS  → /access-denied
 *        - authReason ∈ AUTH_RECOVERABLE_REASONS → recovery loader with
 *          Retry / Sign out / Reload. We render IN PLACE here rather than
 *          redirecting to /login so the user can re-attempt the boot
 *          without losing their session for a transient backend hiccup.
 *        - anything else                       → /login
 *   3. After settle, when there IS a user:
 *        - `requiredRole` mismatch → redirect to that role's home.
 *        - otherwise               → children.
 *
 * Server-side enforcement: this guard is a UX hint, not a security boundary.
 * All protected APIs (incl. /api/admin/*) verify role independently via
 * middleware/auth.js → requireAdmin / requireWriteAccess. The recovery
 * branch deliberately does NOT render `children`, so no protected app
 * content can leak before the backend has confirmed the user.
 */
const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading, hasPersistedSession, authReason, retryBoot, logout } = useAuth();

  if (loading) {
    // Pass `hasPersistedSession` through so AppLoader can pick the right
    // initial-phase subtitle ("Confirming your access…" vs "Please wait
    // a moment."). Title is explicit for the no-session case so existing
    // /Loading/-style tests continue to match.
    return (
      <AppLoader
        title={hasPersistedSession ? undefined : 'Loading…'}
        hasPersistedSession={hasPersistedSession}
        testId="protected-route-loader"
      />
    );
  }

  if (!user) {
    // Backend rejected this signed-in user (NOT_INVITED / INACTIVE /
    // DOMAIN_BLOCKED). Show the branded access-denied screen instead of
    // tossing them at /login where the failure shows as a banner only.
    if (ACCESS_DENIED_REASONS.includes(authReason)) {
      return <Navigate to="/access-denied" replace />;
    }
    // Transient backend failure (timeout / 5xx / network) — session is
    // intentionally preserved. Render the recovery loader IN PLACE so
    // the user can Retry without re-authenticating. Sign out is the
    // escape hatch; Reload is last-resort.
    if (AUTH_RECOVERABLE_REASONS.includes(authReason)) {
      return (
        <AppLoader
          mode="recovery"
          title="We couldn't confirm your access"
          onRetry={retryBoot}
          onSignOut={logout}
          testId="protected-route-recovery"
        />
      );
    }
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    const fallback = user.role === 'admin' ? '/admin' : '/';
    return <Navigate to={fallback} replace />;
  }

  return children;
};

export default ProtectedRoute;
