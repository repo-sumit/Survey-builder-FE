import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppLoader from './AppLoader';

/**
 * Auth-gated route guard.
 *
 * Contract:
 *   - While AuthContext is bootstrapping, render the branded AppLoader. The
 *     bootstrap is bounded by AuthContext.BOOT_TIMEOUT_MS and retries /me once
 *     on cold-backend timeout, so this state is short-lived and never blanks
 *     the page.
 *   - If no user after bootstrap → /login.
 *   - If a `requiredRole` is specified and the user has a different role →
 *     redirect to that role's home (admin→/admin, anyone else→/).
 *
 * Server-side enforcement: this guard is a UX hint, not a security boundary.
 * All protected APIs (incl. /api/admin/*) verify role independently via
 * middleware/auth.js → requireAdmin / requireWriteAccess.
 */
const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading, hasPersistedSession } = useAuth();

  if (loading) {
    return (
      <AppLoader
        title={hasPersistedSession ? 'Restoring your session…' : 'Loading…'}
        testId="protected-route-loader"
      />
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    const fallback = user.role === 'admin' ? '/admin' : '/';
    return <Navigate to={fallback} replace />;
  }

  return children;
};

export default ProtectedRoute;
