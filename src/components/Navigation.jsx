import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/* ─── Inline SVG Icons ─── */
const SurveysIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const ImportIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const DesignationsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
  </svg>
);

const AccessSheetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const AdminIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
  </svg>
);

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const Navigation = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path);

  const navItems = [
    { to: '/',              label: 'Surveys',      icon: <SurveysIcon /> },
    { to: '/import',        label: 'Import',       icon: <ImportIcon /> },
    { to: '/designations',  label: 'Designations', icon: <DesignationsIcon /> },
    { to: '/access-sheet',  label: 'Access Sheet', icon: <AccessSheetIcon /> },
    ...(user?.role === 'admin'
      ? [{ to: '/admin', label: 'Admin', icon: <AdminIcon /> }]
      : []),
  ];

  const userInitial = user?.username?.[0]?.toUpperCase() || '?';
  const userRoleLabel = user?.role === 'admin'
    ? 'Administrator'
    : `State: ${user?.stateCode || '—'}`;

  return (
    <>
      {/* ── Mobile-only top header ── */}
      <div className="nav-mobile-header">
        <div className="nav-brand">
          <div className="nav-brand-mark">F</div>
          <span className="nav-brand-text">FMB Survey</span>
        </div>
        <div className="nav-mobile-right">
          <span className="nav-mobile-user-badge">{user?.username}</span>
          <button className="nav-mobile-logout" onClick={logout} title="Sign Out">
            ↪ Out
          </button>
        </div>
      </div>

      {/* ── Desktop sidebar + Mobile bottom nav ── */}
      <nav className="navigation">
        {/* Desktop brand */}
        <div className="nav-brand">
          <div className="nav-brand-mark">F</div>
          <span className="nav-brand-text">FMB Survey Builder</span>
        </div>

        {/* Nav links */}
        <div className="nav-links">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-link${isActive(item.to) ? ' active' : ''}`}
            >
              <span className="nav-link-icon">{item.icon}</span>
              <span className="nav-link-label">{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Desktop footer — user card + logout */}
        <div className="nav-footer">
          <div className="nav-user-card">
            <div className="nav-user-avatar">{userInitial}</div>
            <div className="nav-user-details">
              <span className="nav-user-name">{user?.username}</span>
              <span className="nav-user-role">{userRoleLabel}</span>
            </div>
          </div>
          <button className="nav-logout-btn" onClick={logout}>
            <span style={{ width: 14, height: 14, display: 'inline-flex' }}><LogoutIcon /></span>
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );
};

export default Navigation;
