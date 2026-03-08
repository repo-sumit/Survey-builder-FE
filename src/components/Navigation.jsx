import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BRAND_LOGO_URL = 'https://i.ibb.co/Wv5BJFsZ/swiftchat.png';

const SurveysIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const ImportIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const DesignationsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const AccessSheetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const AdminIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
  </svg>
);

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const Navigation = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarReady, setSidebarReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSidebarReady(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const isActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));
  const isAdmin = user?.role === 'admin';

  const navItems = isAdmin
    ? [{ to: '/admin', label: 'Admin Panel', icon: <AdminIcon /> }]
    : [
        { to: '/', label: 'Surveys', icon: <SurveysIcon /> },
        { to: '/import', label: 'Import', icon: <ImportIcon /> },
        { to: '/designations', label: 'Designations', icon: <DesignationsIcon /> },
        { to: '/access-sheet', label: 'Access Sheet', icon: <AccessSheetIcon /> }
      ];

  const userInitial = user?.username?.[0]?.toUpperCase() || '?';
  const userRoleLabel = isAdmin ? 'Administrator' : `State: ${user?.stateCode || '-'}`;

  return (
    <>
      <div className="nav-mobile-header">
        <div className="nav-mobile-brand">
          <img className="nav-brand-mark" src={BRAND_LOGO_URL} alt="SwiftChat logo" />
          <div className="nav-brand-copy">
            <span className="nav-brand-text">SwiftChat</span>
            <span className="nav-brand-sub">Survey Builder</span>
          </div>
        </div>
        <div className="nav-mobile-right">
          <span className="nav-mobile-user-badge">{user?.username || 'User'}</span>
          <button className="nav-mobile-logout" onClick={logout} title="Sign Out">
            Sign Out
          </button>
        </div>
      </div>

      <nav className={`navigation${sidebarReady ? ' nav-revealed' : ''}`}>
        <div className="nav-brand">
          <img className="nav-brand-mark" src={BRAND_LOGO_URL} alt="SwiftChat logo" />
          <div className="nav-brand-copy">
            <span className="nav-brand-text">SwiftChat</span>
            <span className="nav-brand-sub">Survey Builder</span>
          </div>
        </div>

        <div className="nav-section-title">Workspace</div>

        <div className="nav-links">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={`nav-link${isActive(item.to) ? ' active' : ''}`}>
              <span className="nav-link-icon">{item.icon}</span>
              <span className="nav-link-label">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="nav-footer">
          <div className="nav-user-card">
            <div className="nav-user-avatar">{userInitial}</div>
            <div className="nav-user-details">
              <span className="nav-user-name">{user?.username}</span>
              <span className="nav-user-role">{userRoleLabel}</span>
            </div>
          </div>

          <div className="nav-footer-actions">
            <button className="nav-logout-btn" onClick={logout}>
              <span className="nav-logout-icon">
                <LogoutIcon />
              </span>
              Sign Out
            </button>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navigation;
