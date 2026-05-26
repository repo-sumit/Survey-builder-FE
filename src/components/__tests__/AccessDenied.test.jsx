/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AccessDenied, { ACCESS_DENIED_REASONS } from '../AccessDenied';

jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn()
}));

const { useAuth } = require('../../contexts/AuthContext');

const makeAuth = (overrides = {}) => ({
  user: null,
  loading: false,
  authReason: null,
  hasPersistedSession: false,
  logout: jest.fn().mockResolvedValue(undefined),
  clearAuthReason: jest.fn(),
  refreshProfile: jest.fn().mockResolvedValue(null),
  ...overrides,
});

const renderAt = (initialPath = '/access-denied', authState) => {
  useAuth.mockReturnValue(authState);
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route path="/login"   element={<div>login-page</div>} />
        <Route path="/admin"   element={<div>admin-home</div>} />
        <Route path="/"        element={<div>state-home</div>} />
      </Routes>
    </MemoryRouter>
  );
};

beforeEach(() => jest.clearAllMocks());

describe('AccessDenied — exports + presentation', () => {
  test('exports the canonical access-denied reason set so guards can import it', () => {
    expect(ACCESS_DENIED_REASONS).toEqual(['NOT_INVITED', 'INACTIVE', 'DOMAIN_BLOCKED']);
  });

  test('renders branded shell with ConveGenius / FMB Survey Builder identity', () => {
    renderAt('/access-denied', makeAuth());
    expect(screen.getByRole('main')).toBeInTheDocument();
    // The product name appears in the brandbar and (sometimes) the body copy;
    // assert at least the brandbar is present.
    const brandbarMatches = screen.getAllByText(/FMB Survey Builder/i);
    expect(brandbarMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/a ConveGenius product/i)).toBeInTheDocument();
  });

  test('lists admin contacts Sumit and Satyanshu', () => {
    renderAt('/access-denied', makeAuth());
    const contacts = screen.getByTestId('access-denied-contacts');
    expect(contacts).toHaveTextContent(/Sumit/);
    expect(contacts).toHaveTextContent(/Satyanshu/);
  });

  test('direct visit with no session shows generic copy — no protected data', () => {
    renderAt('/access-denied', makeAuth());
    expect(screen.getByRole('heading', { name: /Access not granted/i })).toBeInTheDocument();
    // Generic body, not a reason-specific phrase
    expect(screen.getByTestId('access-denied-body')).toHaveTextContent(/don't have access/i);
  });

  test('NOT_INVITED reason shows the pending-access copy', () => {
    renderAt('/access-denied', makeAuth({ authReason: 'NOT_INVITED' }));
    expect(screen.getByRole('heading', { name: /Access pending/i })).toBeInTheDocument();
    expect(screen.getByTestId('access-denied-body')).toHaveTextContent(/not authorized for/i);
  });

  test('INACTIVE reason shows the inactive-account copy', () => {
    renderAt('/access-denied', makeAuth({ authReason: 'INACTIVE' }));
    expect(screen.getByRole('heading', { name: /Account inactive/i })).toBeInTheDocument();
    expect(screen.getByTestId('access-denied-body')).toHaveTextContent(/deactivated/i);
  });

  test('DOMAIN_BLOCKED reason shows the domain copy', () => {
    renderAt('/access-denied', makeAuth({ authReason: 'DOMAIN_BLOCKED' }));
    expect(screen.getByRole('heading', { name: /domain not allowed/i })).toBeInTheDocument();
  });

  test('unknown reason codes still surface a polished fallback (never blank)', () => {
    renderAt('/access-denied', makeAuth({ authReason: 'SOMETHING_WEIRD' }));
    expect(screen.getByRole('heading', { name: /Access not granted/i })).toBeInTheDocument();
  });
});

describe('AccessDenied — actions', () => {
  test('Sign out calls logout() then navigates to /login', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    renderAt('/access-denied', makeAuth({ authReason: 'NOT_INVITED', logout }));
    fireEvent.click(screen.getByTestId('access-denied-signout'));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await screen.findByText(/login-page/);
  });

  test('Back to login clears authReason and navigates to /login', async () => {
    const clearAuthReason = jest.fn();
    renderAt('/access-denied', makeAuth({ authReason: 'NOT_INVITED', clearAuthReason }));
    fireEvent.click(screen.getByTestId('access-denied-back'));
    expect(clearAuthReason).toHaveBeenCalled();
    await screen.findByText(/login-page/);
  });

  test('Try again with NO persisted session clears reason and goes to /login', async () => {
    const clearAuthReason = jest.fn();
    const refreshProfile = jest.fn().mockResolvedValue(null);
    renderAt('/access-denied', makeAuth({
      hasPersistedSession: false, clearAuthReason, refreshProfile,
    }));
    fireEvent.click(screen.getByTestId('access-denied-retry'));
    await waitFor(() => expect(clearAuthReason).toHaveBeenCalled());
    expect(refreshProfile).not.toHaveBeenCalled();
    await screen.findByText(/login-page/);
  });

  test('Try again WITH persisted session calls refreshProfile (does not navigate by itself)', async () => {
    const refreshProfile = jest.fn().mockResolvedValue(null);
    const clearAuthReason = jest.fn();
    renderAt('/access-denied', makeAuth({
      hasPersistedSession: true, refreshProfile, clearAuthReason,
    }));
    fireEvent.click(screen.getByTestId('access-denied-retry'));
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(clearAuthReason).not.toHaveBeenCalled();
  });
});

describe('AccessDenied — never traps authorized users', () => {
  test('authorized admin is bounced to /admin', async () => {
    renderAt('/access-denied', makeAuth({
      user: { username: 'admin', role: 'admin' },
    }));
    await screen.findByText(/admin-home/);
  });

  test('authorized state user is bounced to /', async () => {
    renderAt('/access-denied', makeAuth({
      user: { username: 'priya', role: 'state', stateCode: 'GJ', isActive: true },
    }));
    await screen.findByText(/state-home/);
  });

  test('while auth is still bootstrapping (loading=true), no redirect happens yet', () => {
    renderAt('/access-denied', makeAuth({
      loading: true,
      user: { username: 'pending', role: 'admin' }, // user "present" but we're still loading
    }));
    // Card still renders; the effect won't fire until loading flips false
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.queryByText(/admin-home/)).not.toBeInTheDocument();
  });
});
