import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Navigation = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <nav className="navigation">
      <div className="nav-container">
        <h1 className="nav-title">FMB Survey Builder</h1>
        <div className="nav-links">
          <Link
            to="/"
            className={location.pathname === '/' ? 'nav-link active' : 'nav-link'}
          >
            Surveys
          </Link>
          <Link
            to="/import"
            className={location.pathname === '/import' ? 'nav-link active' : 'nav-link'}
          >
            Import
          </Link>
          <Link
            to="/validate-upload"
            className={location.pathname === '/validate-upload' ? 'nav-link active' : 'nav-link'}
          >
            Validate Upload
          </Link>
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              className={location.pathname === '/admin' ? 'nav-link active' : 'nav-link'}
            >
              Admin
            </Link>
          )}
          <span className="nav-user-info">
            {user?.username}
            {user?.role === 'admin' ? ' (Admin)' : ` (${user?.stateCode || 'State'})`}
          </span>
          <button className="nav-logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
