import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Auth-gated route guard.
 *
 * Contract:
 *   - While AuthContext is bootstrapping, render a small placeholder. The
 *     bootstrap has a hard timeout (see AuthContext.BOOT_TIMEOUT_MS), so this
 *     state is always short-lived; it cannot hang the app indefinitely.
 *   - If no user after bootstrap → /login.
 *   - If a `requiredRole` is specified and the user has a different role →
 *     redirect to that role's home (admin→/admin, anyone else→/).
 *
 * Server-side enforcement: this guard is a UX hint, not a security boundary.
 * All protected APIs (incl. /api/admin/*) verify role independently via
 * middleware/auth.js → requireAdmin / requireWriteAccess.
 */
const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="loading"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-3, #888)' }}
        aria-busy="true"
      >
        Loading…
      </div>
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
