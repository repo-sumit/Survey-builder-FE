import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Icon from './Icon';

/**
 * TopNav — alternate horizontal layout, selectable from the Tweaks panel.
 *
 * Same role gating as Sidebar (admin users see admin items, state users
 * see workspace + config items). Mounted by App.jsx when the user has
 * chosen `tweaks.nav === 'top'`.
 */
const VALIDATION_CHECKLIST_URL =
  'https://docs.google.com/spreadsheets/d/1tgkxMGBzqBcmSF6dx3BSgqkobmzq_v2STFYM0f-tZk0/edit?usp=sharing';

const STATE_USER_NAV = [
  { to: '/',             label: 'Surveys',     icon: 'layout',    match: (p) => p === '/' || p.startsWith('/surveys') },
  { to: '/import',       label: 'Import',      icon: 'upload' },
  { to: '/validator',    label: 'Validator',   icon: 'shield' },
  { to: '/designations', label: 'Designations',icon: 'users' },
  { to: '/access-sheet', label: 'Access Sheet',icon: 'key' },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Admin Panel', icon: 'shield' },
];

const isActive = (pathname, item) => {
  if (item.match) return item.match(pathname);
  return pathname === item.to || pathname.startsWith(item.to + '/');
};

const TopNav = ({ onSearchOpen, onTweaksOpen }) => {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const items = user?.role === 'admin' ? ADMIN_NAV : STATE_USER_NAV;
  const displayName = user?.name || user?.email || user?.username || 'User';
  const initials = (displayName.slice(0, 2) || '?').toUpperCase();

  return (
    <header className="fmb-topnav" role="banner">
      <Link to="/" className="fmb-sidebar-brand" aria-label="FMB Survey Builder home" style={{ padding: 0 }}>
        <img src="/assets/cg-logo.png" alt="" style={{ width: 24, height: 24 }} />
        <div>
          <div className="fmb-sidebar-brand-name">FMB Builder</div>
        </div>
      </Link>

      <nav className="fmb-topnav-links" aria-label="Primary navigation">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="fmb-nav-item"
            aria-current={isActive(pathname, item) ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
        <a
          href={VALIDATION_CHECKLIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fmb-nav-item"
        >
          <Icon name="fileCheck" />
          <span>Validation Checklist</span>
          <Icon name="external" size={11} style={{ marginLeft: 4, color: 'var(--text-4, #9b9aa1)' }} />
        </a>
      </nav>

      <div className="fmb-topnav-spacer" />

      {onSearchOpen && (
        <button
          type="button"
          className="fmb-search-box"
          onClick={onSearchOpen}
          aria-label="Open command palette"
          style={{ maxWidth: 280, padding: 0, background: 'transparent', border: 'none' }}
        >
          <Icon name="search" />
          <input
            placeholder="Search…"
            readOnly
            tabIndex={-1}
            onFocus={(e) => { e.target.blur(); onSearchOpen(); }}
          />
          <span className="fmb-kbd">⌘K</span>
        </button>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Tweaks feature disabled — button intentionally commented out.
            Re-enable by uncommenting this block AND the TweaksPanel render
            in App.jsx. */}
        {/* {onTweaksOpen && (
          <button type="button" className="fmb-icon-btn" aria-label="Open tweaks" onClick={onTweaksOpen}>
            <Icon name="sliders" />
          </button>
        )} */}
        <button type="button" className="fmb-icon-btn" aria-label="Sign out" onClick={logout}>
          <Icon name="logout" />
        </button>
        <div className="fmb-avatar sm" title={displayName}>{initials}</div>
      </div>
    </header>
  );
};

export default TopNav;
