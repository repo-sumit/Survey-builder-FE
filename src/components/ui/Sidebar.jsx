import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Icon from './Icon';

/**
 * Sidebar — the production app shell's left rail.
 *
 * Drop-in replacement for the legacy <Navigation /> visually, but:
 *   - Uses fmb-* design-system classes so it picks up tokens.css.
 *   - Pulls `user` from AuthContext (NOT a prop) so it can hide
 *     admin-only nav items based on `user.role === 'admin'`.
 *   - Honors React Router (Link + useLocation) — no hash routing.
 *   - Calls `logout` from AuthContext (it still purges Supabase
 *     storage, React Query cache, etc. per ADR 0001).
 *
 * Visual behavior collapses to an icon-rail at <1000px via
 * ui.css's @media query.
 */

// Two-section nav: "Workspace" (everyday flows) and "Configuration"
// (admin / system tools). Mirrors the design handoff's grouping.
const STATE_USER_NAV = [
  { to: '/',             label: 'Surveys',             icon: 'layout',    group: 'work',   match: (p) => p === '/' || p.startsWith('/surveys') },
  { to: '/import',       label: 'Import',              icon: 'upload',    group: 'work' },
  { to: '/validator',    label: 'Dumpsheet Validator', icon: 'shield',    group: 'work' },
  { to: '/designations', label: 'Designations',        icon: 'users',     group: 'config' },
  { to: '/access-sheet', label: 'Access Sheet',        icon: 'key',       group: 'config' },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Admin Panel', icon: 'shield', group: 'config' },
];

const VALIDATION_CHECKLIST_URL =
  'https://docs.google.com/spreadsheets/d/1tgkxMGBzqBcmSF6dx3BSgqkobmzq_v2STFYM0f-tZk0/edit?usp=sharing';

const isActive = (pathname, item) => {
  if (item.match) return item.match(pathname);
  return pathname === item.to || pathname.startsWith(item.to + '/');
};

const NavLink = ({ to, label, icon, active, badge }) => (
  <Link
    to={to}
    className="fmb-nav-item"
    aria-current={active ? 'page' : undefined}
  >
    <Icon name={icon} />
    <span>{label}</span>
    {badge && <span className="fmb-nav-badge">{badge}</span>}
  </Link>
);

const Sidebar = ({ onSearchOpen, onTweaksOpen }) => {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const role = user?.role;
  const isAdmin = role === 'admin';

  // Admin users see ONLY admin items + global resources.
  // State users see workspace + config items minus admin.
  const items = isAdmin ? ADMIN_NAV : STATE_USER_NAV;
  const workItems   = items.filter((n) => n.group === 'work');
  const configItems = items.filter((n) => n.group === 'config');

  const displayName = user?.name || user?.email || user?.username || 'User';
  const initials = (displayName.slice(0, 2) || '?').toUpperCase();
  const roleLabel = isAdmin
    ? 'Administrator'
    : (user?.stateCode ? `State · ${user.stateCode}` : 'State');

  return (
    <aside className="fmb-sidebar" aria-label="Primary navigation">
      <Link to="/" className="fmb-sidebar-brand" aria-label="FMB Survey Builder home">
        <img src="/assets/cg-logo.png" alt="" />
        <div>
          <div className="fmb-sidebar-brand-name">FMB Builder</div>
          <div className="fmb-sidebar-brand-sub">ConveGenius</div>
        </div>
      </Link>

      {onSearchOpen && (
        <button
          type="button"
          className="fmb-search-box"
          onClick={onSearchOpen}
          aria-label="Open command palette"
          style={{ marginBottom: 8, padding: 0, background: 'transparent', border: 'none', display: 'block', maxWidth: 'none' }}
        >
          <Icon name="search" />
          <input
            placeholder="Search surveys, questions…"
            readOnly
            tabIndex={-1}
            onFocus={(e) => { e.target.blur(); onSearchOpen(); }}
          />
          <span className="fmb-kbd">⌘K</span>
        </button>
      )}

      {workItems.length > 0 && (
        <div className="fmb-nav-section">
          <div className="fmb-nav-section-title">Workspace</div>
          {workItems.map((item) => (
            <NavLink key={item.to} {...item} active={isActive(pathname, item)} />
          ))}
        </div>
      )}

      {configItems.length > 0 && (
        <div className="fmb-nav-section">
          <div className="fmb-nav-section-title">Configuration</div>
          {configItems.map((item) => (
            <NavLink key={item.to} {...item} active={isActive(pathname, item)} />
          ))}
        </div>
      )}

      <div className="fmb-nav-section">
        <div className="fmb-nav-section-title">Resources</div>
        <a
          href={VALIDATION_CHECKLIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fmb-nav-item"
        >
          <Icon name="fileCheck" />
          <span>FMB Validation Checklist</span>
          <Icon name="external" size={12} style={{ marginLeft: 'auto', color: 'var(--text-4, #9b9aa1)' }} />
        </a>
      </div>

      <div className="fmb-sidebar-spacer" />

      <div className="fmb-sidebar-user">
        <div className="fmb-avatar">{initials}</div>
        <div className="fmb-sidebar-user-meta">
          <div className="fmb-user-name">{displayName}</div>
          <div className="fmb-user-role">{roleLabel}</div>
        </div>
        {onTweaksOpen && (
          <button
            type="button"
            className="fmb-icon-btn"
            title="Open tweaks"
            aria-label="Open tweaks panel"
            onClick={onTweaksOpen}
          >
            <Icon name="sliders" />
          </button>
        )}
        <button
          type="button"
          className="fmb-icon-btn"
          title="Sign out"
          aria-label="Sign out"
          onClick={logout}
        >
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
