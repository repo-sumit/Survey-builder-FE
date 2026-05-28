/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ReconnectBanner from '../ReconnectBanner';

// Mock useAuth so we can drive the banner through each state without
// spinning up the real AuthProvider (which needs axios + Supabase).
jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn(),
  AUTH_WARNINGS: { RECONNECTING: 'RECONNECTING' }
}));
const { useAuth } = require('../../contexts/AuthContext');

describe('ReconnectBanner', () => {
  beforeEach(() => useAuth.mockReset());

  test('renders nothing when authWarning is null (the common case)', () => {
    useAuth.mockReturnValue({
      authWarning: null,
      isRevalidating: false,
      retryBoot: jest.fn(),
      dismissAuthWarning: jest.fn()
    });
    const { container } = render(<ReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });

  test('renders the banner with copy + Retry + Dismiss when authWarning="RECONNECTING"', () => {
    useAuth.mockReturnValue({
      authWarning: 'RECONNECTING',
      isRevalidating: false,
      retryBoot: jest.fn(),
      dismissAuthWarning: jest.fn()
    });
    render(<ReconnectBanner />);
    expect(screen.getByTestId('reconnect-banner')).toBeInTheDocument();
    // Documented copy — locks the wording so a CSS refactor doesn't change UX.
    expect(screen.getByText(/Backend is reconnecting/i)).toBeInTheDocument();
    expect(screen.getByText(/saving may be temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByTestId('reconnect-banner-retry')).toBeInTheDocument();
    expect(screen.getByTestId('reconnect-banner-dismiss')).toBeInTheDocument();
  });

  test('Retry click calls retryBoot from AuthContext', async () => {
    const retryBoot = jest.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({
      authWarning: 'RECONNECTING',
      isRevalidating: false,
      retryBoot,
      dismissAuthWarning: jest.fn()
    });
    render(<ReconnectBanner />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('reconnect-banner-retry'));
    });
    expect(retryBoot).toHaveBeenCalledTimes(1);
  });

  test('Retry button is disabled while isRevalidating is true (prevents double-fire)', () => {
    const retryBoot = jest.fn();
    useAuth.mockReturnValue({
      authWarning: 'RECONNECTING',
      isRevalidating: true,
      retryBoot,
      dismissAuthWarning: jest.fn()
    });
    render(<ReconnectBanner />);
    const retry = screen.getByTestId('reconnect-banner-retry');
    expect(retry).toBeDisabled();
    expect(retry.textContent).toMatch(/Retrying/i);
    fireEvent.click(retry);
    expect(retryBoot).not.toHaveBeenCalled();
  });

  test('Dismiss click calls dismissAuthWarning', () => {
    const dismissAuthWarning = jest.fn();
    useAuth.mockReturnValue({
      authWarning: 'RECONNECTING',
      isRevalidating: false,
      retryBoot: jest.fn(),
      dismissAuthWarning
    });
    render(<ReconnectBanner />);
    fireEvent.click(screen.getByTestId('reconnect-banner-dismiss'));
    expect(dismissAuthWarning).toHaveBeenCalledTimes(1);
  });

  test('does not render for an unknown authWarning value (defensive)', () => {
    useAuth.mockReturnValue({
      authWarning: 'SOME_FUTURE_REASON',
      isRevalidating: false,
      retryBoot: jest.fn(),
      dismissAuthWarning: jest.fn()
    });
    const { container } = render(<ReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });
});
