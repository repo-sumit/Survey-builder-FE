/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

// AuthContext is mocked so we can drive role gating + the logout button
// without spinning up the real provider (which would also need Supabase
// + axios in the test environment).
jest.mock('../../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn()
}));
const { useAuth } = require('../../../contexts/AuthContext');

const renderAt = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar onSearchOpen={() => {}} onTweaksOpen={() => {}} />
    </MemoryRouter>
  );

describe('Sidebar — role gating', () => {
  beforeEach(() => useAuth.mockReset());

  test('state users see Workspace + Configuration items, NOT Admin Panel', () => {
    useAuth.mockReturnValue({
      user: { username: 'priya', role: 'state', stateCode: 'GJ', isActive: true },
      logout: jest.fn(),
    });
    renderAt('/');

    // Workspace
    expect(screen.getByRole('link', { name: /^Surveys$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Import$/i })).toBeInTheDocument();
    // Label shortened from "Dumpsheet Validator" → "Validator" to match
    // the visual weight of the other Workspace items at 240px. The route
    // is unchanged (/validator).
    expect(screen.getByRole('link', { name: /^Validator$/i })).toBeInTheDocument();
    // Configuration
    expect(screen.getByRole('link', { name: /^Designations$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Access Sheet$/i })).toBeInTheDocument();
    // Admin must NOT be visible
    expect(screen.queryByRole('link', { name: /^Admin Panel$/i })).not.toBeInTheDocument();
  });

  test('admin users see only the Admin Panel item (+ shared resources)', () => {
    useAuth.mockReturnValue({
      user: { username: 'admin', role: 'admin', stateCode: null, isActive: true },
      logout: jest.fn(),
    });
    renderAt('/admin');

    expect(screen.getByRole('link', { name: /^Admin Panel$/i })).toBeInTheDocument();
    // None of the state-user routes should be visible
    expect(screen.queryByRole('link', { name: /^Surveys$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Designations$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Access Sheet$/i })).not.toBeInTheDocument();
  });

  test('FMB Validation Checklist link is always present and opens externally', () => {
    useAuth.mockReturnValue({
      user: { username: 'p', role: 'state', stateCode: 'MH', isActive: true },
      logout: jest.fn(),
    });
    renderAt('/');
    const link = screen.getByRole('link', { name: /Validation Checklist/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link.getAttribute('href')).toMatch(/docs\.google\.com\/spreadsheets/);
  });

  test('sign-out button invokes AuthContext.logout', () => {
    const logout = jest.fn();
    useAuth.mockReturnValue({
      user: { username: 'p', role: 'state', stateCode: 'MH', isActive: true },
      logout,
    });
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: /Sign out/i }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  test('current route gets aria-current="page"', () => {
    useAuth.mockReturnValue({
      user: { username: 'p', role: 'state', stateCode: 'MH', isActive: true },
      logout: jest.fn(),
    });
    renderAt('/designations');
    expect(screen.getByRole('link', { name: /^Designations$/i }))
      .toHaveAttribute('aria-current', 'page');
    // Sibling items should not be marked current
    expect(screen.getByRole('link', { name: /^Surveys$/i }))
      .not.toHaveAttribute('aria-current');
  });
});

describe('Sidebar — command-palette trigger', () => {
  beforeEach(() => useAuth.mockReset());

  test('admin role: trigger is a real button with admin-appropriate aria-label and copy', () => {
    useAuth.mockReturnValue({
      user: { username: 'admin', role: 'admin', isActive: true },
      logout: jest.fn(),
    });
    renderAt('/admin');

    const trigger = screen.getByTestId('sidebar-cmd-trigger');
    // Must be a real <button>, not a button wrapping a readonly <input>.
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-label')).toMatch(/admin command palette/i);
    expect(trigger).toHaveTextContent(/Search admin tools/i);
    // No nested input inside the trigger (the old pattern).
    expect(trigger.querySelector('input')).toBeNull();
  });

  test('state role: trigger uses survey-related copy', () => {
    useAuth.mockReturnValue({
      user: { username: 'priya', role: 'state', stateCode: 'GJ', isActive: true },
      logout: jest.fn(),
    });
    renderAt('/');

    const trigger = screen.getByTestId('sidebar-cmd-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-label')).toMatch(/survey command palette/i);
    expect(trigger).toHaveTextContent(/Search surveys/i);
    expect(trigger.querySelector('input')).toBeNull();
  });

  test('trigger click invokes onSearchOpen', () => {
    const onSearchOpen = jest.fn();
    useAuth.mockReturnValue({
      user: { username: 'p', role: 'state', stateCode: 'MH', isActive: true },
      logout: jest.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar onSearchOpen={onSearchOpen} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('sidebar-cmd-trigger'));
    expect(onSearchOpen).toHaveBeenCalledTimes(1);
  });

  test('trigger is omitted when onSearchOpen prop is not supplied', () => {
    useAuth.mockReturnValue({
      user: { username: 'p', role: 'state', stateCode: 'MH', isActive: true },
      logout: jest.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('sidebar-cmd-trigger')).not.toBeInTheDocument();
  });
});

describe('Sidebar — resources section', () => {
  beforeEach(() => useAuth.mockReset());

  test('resource label is "Validation Checklist" (the long "FMB" prefix was wrapping at 240px)', () => {
    useAuth.mockReturnValue({
      user: { username: 'p', role: 'state', stateCode: 'MH', isActive: true },
      logout: jest.fn(),
    });
    renderAt('/');
    const link = screen.getByRole('link', { name: /Validation Checklist/i });
    // Visible text must NOT carry the legacy "FMB " prefix.
    expect(link.textContent).not.toMatch(/^\s*FMB\s+Validation/);
    // Carries the secondary-weight modifier so it doesn't compete with
    // primary nav items visually.
    expect(link.className).toMatch(/fmb-nav-item--secondary/);
  });
});
