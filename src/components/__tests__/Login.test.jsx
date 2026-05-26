/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../Login';

/**
 * Login covers a small surface but its contract matters for ADR 0001:
 *   - It must call authAPI.warmup() on mount (backend pre-warm).
 *   - It must surface authReason banners using the canonical reason codes.
 *   - It must invoke loginWithGoogle() — never a mock or username/password.
 *   - Errors must be inline and visible.
 *
 * AuthContext and the api module are mocked so we can drive each path
 * without spinning up Supabase or axios.
 */
jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn()
}));
jest.mock('../../services/api', () => ({
  __esModule: true,
  authAPI: {
    warmup: jest.fn(),
  }
}));

const { useAuth } = require('../../contexts/AuthContext');
const { authAPI } = require('../../services/api');

const makeAuth = (overrides = {}) => ({
  loginWithGoogle: jest.fn().mockResolvedValue(undefined),
  isSupabaseConfigured: true,
  authReason: null,
  clearAuthReason: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  // mockResolvedValue is wiped by clearAllMocks in this Jest version;
  // re-install the implementation each test so the mount effect succeeds.
  authAPI.warmup.mockImplementation(() => Promise.resolve(true));
  useAuth.mockReturnValue(makeAuth());
});

describe('Login', () => {
  test('renders the brand identity and a Google sign-in button', () => {
    render(<Login />);
    expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument();
    expect(screen.getByText(/FMB Survey Builder/i)).toBeInTheDocument();
    expect(screen.getByText(/a ConveGenius product/i)).toBeInTheDocument();
    expect(screen.getByTestId('login-google-button')).toHaveTextContent(/Continue with Google/i);
  });

  test('warms the backend on mount', () => {
    render(<Login />);
    expect(authAPI.warmup).toHaveBeenCalledTimes(1);
  });

  test('clicking Continue with Google calls loginWithGoogle() — never a mock', async () => {
    const loginWithGoogle = jest.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    render(<Login />);
    fireEvent.click(screen.getByTestId('login-google-button'));
    await waitFor(() => expect(loginWithGoogle).toHaveBeenCalledTimes(1));
  });

  test('shows "Redirecting to Google…" and disables the button while in flight', async () => {
    let resolve;
    const loginWithGoogle = jest.fn(() => new Promise((r) => { resolve = r; }));
    useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    render(<Login />);

    const btn = screen.getByTestId('login-google-button');
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveTextContent(/Redirecting to Google/i);
    expect(btn).toHaveAttribute('aria-busy', 'true');
    resolve();
  });

  test('surface authReason=NOT_INVITED as a polished banner with clear copy', () => {
    useAuth.mockReturnValue(makeAuth({ authReason: 'NOT_INVITED' }));
    render(<Login />);
    const banner = screen.getByTestId('login-auth-reason');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent(/not invited/i);
  });

  test('surface authReason=INACTIVE banner', () => {
    useAuth.mockReturnValue(makeAuth({ authReason: 'INACTIVE' }));
    render(<Login />);
    expect(screen.getByTestId('login-auth-reason')).toHaveTextContent(/inactive/i);
  });

  test('surface authReason=DOMAIN_BLOCKED banner', () => {
    useAuth.mockReturnValue(makeAuth({ authReason: 'DOMAIN_BLOCKED' }));
    render(<Login />);
    expect(screen.getByTestId('login-auth-reason')).toHaveTextContent(/domain is not allowed/i);
  });

  test('surface authReason=BOOT_TIMEOUT banner (new for the redesign)', () => {
    useAuth.mockReturnValue(makeAuth({ authReason: 'BOOT_TIMEOUT' }));
    render(<Login />);
    expect(screen.getByTestId('login-auth-reason')).toHaveTextContent(/couldn't reach the server/i);
  });

  test('unknown authReason codes still surface a fallback banner (never silent)', () => {
    useAuth.mockReturnValue(makeAuth({ authReason: 'WEIRD_NEW_CODE' }));
    render(<Login />);
    expect(screen.getByTestId('login-auth-reason')).toHaveTextContent(/couldn't complete sign-in/i);
  });

  test('clicking the Google button clears authReason before attempting login', async () => {
    const clearAuthReason = jest.fn();
    useAuth.mockReturnValue(makeAuth({ clearAuthReason, authReason: 'NOT_INVITED' }));
    render(<Login />);
    fireEvent.click(screen.getByTestId('login-google-button'));
    await waitFor(() => expect(clearAuthReason).toHaveBeenCalled());
  });

  test('shows an error banner when loginWithGoogle throws', async () => {
    const loginWithGoogle = jest.fn().mockRejectedValue(new Error('OAuth popup closed'));
    useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    render(<Login />);
    fireEvent.click(screen.getByTestId('login-google-button'));
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent(/OAuth popup closed/i));
    // Button re-enables so the user can retry.
    expect(screen.getByTestId('login-google-button')).not.toBeDisabled();
  });

  test('configuration error replaces the Google button when Supabase is not configured', () => {
    useAuth.mockReturnValue(makeAuth({ isSupabaseConfigured: false }));
    render(<Login />);
    expect(screen.queryByTestId('login-google-button')).not.toBeInTheDocument();
    expect(screen.getByText(/Google sign-in is not configured/i)).toBeInTheDocument();
  });

  test('no legacy username/password form is rendered', () => {
    render(<Login />);
    // Belt and braces — make sure the redesign did NOT reintroduce a
    // password input. (The legacy login flow is disabled server-side.)
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/continue as admin/i)).not.toBeInTheDocument();
  });
});
