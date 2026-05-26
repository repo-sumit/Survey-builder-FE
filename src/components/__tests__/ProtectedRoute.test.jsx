/* eslint-env jest */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

// Mock useAuth so we can drive ProtectedRoute through each state without spinning
// up a real AuthProvider (which would also need axios + Supabase client).
jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn()
}));
const { useAuth } = require('../../contexts/AuthContext');

const renderAt = (initialPath, { children, requiredRole } = {}) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole={requiredRole}>
              {children || <div>admin-panel</div>}
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<div>state-home</div>} />
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/access-denied" element={<div>access-denied-page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute', () => {
  beforeEach(() => useAuth.mockReset());

  test('renders Loading… placeholder while AuthContext is bootstrapping', () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    renderAt('/admin');
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  test('unauthenticated user is redirected to /login', () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderAt('/admin');
    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  test('admin user reaches an admin-required route', () => {
    useAuth.mockReturnValue({ user: { role: 'admin' }, loading: false });
    renderAt('/admin', { requiredRole: 'admin' });
    expect(screen.getByText('admin-panel')).toBeInTheDocument();
  });

  test('non-admin trying to hit /admin is redirected to /', () => {
    useAuth.mockReturnValue({ user: { role: 'state' }, loading: false });
    renderAt('/admin', { requiredRole: 'admin' });
    expect(screen.getByText('state-home')).toBeInTheDocument();
  });

  test.each(['NOT_INVITED', 'INACTIVE', 'DOMAIN_BLOCKED'])(
    'no user + authReason=%s sends the visitor to /access-denied instead of /login',
    (reason) => {
      useAuth.mockReturnValue({ user: null, loading: false, authReason: reason });
      renderAt('/admin');
      expect(screen.getByText('access-denied-page')).toBeInTheDocument();
      expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    }
  );

  test('admin hitting a non-admin route is redirected to /admin', () => {
    useAuth.mockReturnValue({ user: { role: 'admin' }, loading: false });
    render(
      <MemoryRouter initialEntries={['/state-only']}>
        <Routes>
          <Route
            path="/state-only"
            element={
              <ProtectedRoute requiredRole="state">
                <div>state-content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/admin" element={<div>admin-home</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('admin-home')).toBeInTheDocument();
  });
});
