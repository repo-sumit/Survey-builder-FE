/* eslint-env jest */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicOnlyRoute from '../PublicOnlyRoute';

jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn()
}));
const { useAuth } = require('../../contexts/AuthContext');

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <div>login-form</div>
            </PublicOnlyRoute>
          }
        />
        <Route path="/admin" element={<div>admin-home</div>} />
        <Route path="/" element={<div>state-home</div>} />
        <Route path="/access-denied" element={<div>access-denied-page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('PublicOnlyRoute (/login)', () => {
  beforeEach(() => useAuth.mockReset());

  test('renders Loading placeholder while AuthContext is bootstrapping', () => {
    useAuth.mockReturnValue({ user: null, loading: true, hasPersistedSession: false });
    renderAt('/login');
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  test('shows "Restoring your session…" copy when a persisted session is detected', () => {
    useAuth.mockReturnValue({ user: null, loading: true, hasPersistedSession: true });
    renderAt('/login');
    // This is the fix for the perceived-logout flash: the bootstrap UI must
    // tell the user "we still know you" — never "we don't know you yet".
    expect(screen.getByText(/Restoring your session/i)).toBeInTheDocument();
  });

  test('unauthenticated user sees the login form', () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderAt('/login');
    expect(screen.getByText('login-form')).toBeInTheDocument();
  });

  test('authenticated admin is redirected to /admin (no logout side effect)', () => {
    useAuth.mockReturnValue({ user: { role: 'admin' }, loading: false });
    renderAt('/login');
    expect(screen.getByText('admin-home')).toBeInTheDocument();
    expect(screen.queryByText('login-form')).not.toBeInTheDocument();
  });

  test('authenticated non-admin is redirected to /', () => {
    useAuth.mockReturnValue({ user: { role: 'state' }, loading: false });
    renderAt('/login');
    expect(screen.getByText('state-home')).toBeInTheDocument();
  });

  test.each(['NOT_INVITED', 'INACTIVE', 'DOMAIN_BLOCKED'])(
    'no user + authReason=%s on /login bounces to /access-denied',
    (reason) => {
      useAuth.mockReturnValue({ user: null, loading: false, authReason: reason });
      renderAt('/login');
      expect(screen.getByText('access-denied-page')).toBeInTheDocument();
      expect(screen.queryByText('login-form')).not.toBeInTheDocument();
    }
  );

  test('unknown authReason codes still let the user see /login (no infinite bounce)', () => {
    useAuth.mockReturnValue({ user: null, loading: false, authReason: 'SOMETHING_WEIRD' });
    renderAt('/login');
    expect(screen.getByText('login-form')).toBeInTheDocument();
  });
});
