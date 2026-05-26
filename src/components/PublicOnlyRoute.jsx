import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Wrap routes that should ONLY be visible to unauthenticated users (e.g. /login).
 * If the auth bootstrap is still running, we render a small placeholder rather than
 * the login form — this prevents the page from flashing the login UI on hard refresh
 * for an already-authenticated user.
 *
 * Authenticated users are redirected to their role's home:
 *   - admin → /admin
 *   - everyone else → /
 */
const PublicOnlyRoute = ({ children }) => {
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

  if (user) {
    const target = user.role === 'admin' ? '/admin' : '/';
    return <Navigate to={target} replace />;
  }

  return children;
};

export default PublicOnlyRoute;
