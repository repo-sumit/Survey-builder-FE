import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, session, loading, authError } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // No Supabase session at all → kick to login.
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Supabase session exists but backend rejected (uninvited / inactive / no
  // profile). Send to /login so the user sees the explanation banner from
  // AuthContext.authError. The login screen also lets them sign out of Google.
  if (!user) {
    return <Navigate to="/login" replace state={{ blockedReason: authError }} />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  }

  return children;
};

export default ProtectedRoute;
