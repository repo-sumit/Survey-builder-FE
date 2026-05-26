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
      </Routes>
    </MemoryRouter>
  );

describe('PublicOnlyRoute (/login)', () => {
  beforeEach(() => useAuth.mockReset());

  test('renders Loading placeholder while AuthContext is bootstrapping', () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    renderAt('/login');
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
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
});
