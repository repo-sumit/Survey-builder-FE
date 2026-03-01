import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Role check: if a specific role is required, the user must have exactly that role.
  // Admin users trying to access admin route: allowed.
  // Any user trying to access a route they don't have the role for: redirect.
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  }

  return children;
};

export default ProtectedRoute;
