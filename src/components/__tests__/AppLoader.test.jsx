/* eslint-env jest */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import AppLoader from '../AppLoader';

describe('AppLoader — loading mode (default)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  test('initial render shows the spinner and the default copy, no action buttons', () => {
    render(<AppLoader title="Restoring your session…" />);
    expect(screen.getByText('Restoring your session…')).toBeInTheDocument();
    // No actions before STALE_MS.
    expect(screen.queryByTestId('app-loader-reload')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-loader-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-loader-signout')).not.toBeInTheDocument();
    // aria-busy is on for loading mode.
    const root = screen.getByTestId('app-loader');
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.getAttribute('data-mode')).toBe('loading');
  });

  test('after SLOW_MS the subtitle copy switches to the "Still working…" message', () => {
    render(<AppLoader title="Restoring your session…" />);
    act(() => { jest.advanceTimersByTime(4_000); });
    expect(screen.getByText(/Still working/i)).toBeInTheDocument();
  });

  test('after STALE_MS the Reload action appears and exposes recovery copy', () => {
    render(<AppLoader title="Restoring your session…" />);
    act(() => { jest.advanceTimersByTime(12_000); });
    expect(screen.getByTestId('app-loader-reload')).toBeInTheDocument();
    expect(screen.getByText(/backend may be waking up/i)).toBeInTheDocument();
    // Loading-mode stale phase does NOT show Retry / Sign out — those are
    // recovery-mode only.
    expect(screen.queryByTestId('app-loader-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-loader-signout')).not.toBeInTheDocument();
  });
});

describe('AppLoader — recovery mode', () => {
  test('renders alert role and all three actions immediately (no spinner, no waiting)', () => {
    const onRetry = jest.fn();
    const onSignOut = jest.fn();
    render(
      <AppLoader
        mode="recovery"
        title="We couldn't confirm your access"
        onRetry={onRetry}
        onSignOut={onSignOut}
      />
    );
    const root = screen.getByTestId('app-loader');
    expect(root.getAttribute('data-mode')).toBe('recovery');
    expect(root.getAttribute('role')).toBe('alert');
    // No aria-busy in recovery — we're not waiting on anything anymore.
    expect(root.getAttribute('aria-busy')).toBe('false');
    // All three actions immediately visible.
    expect(screen.getByTestId('app-loader-retry')).toBeInTheDocument();
    expect(screen.getByTestId('app-loader-signout')).toBeInTheDocument();
    expect(screen.getByTestId('app-loader-reload')).toBeInTheDocument();
    // Recovery-specific copy exposes the "your Google session exists but…" hint.
    expect(screen.getByText(/Google session exists/i)).toBeInTheDocument();
  });

  test('Retry button invokes onRetry and disables the button while in-flight', async () => {
    let release;
    const onRetry = jest.fn(() => new Promise((r) => { release = r; }));
    render(<AppLoader mode="recovery" onRetry={onRetry} onSignOut={() => {}} />);
    const retry = screen.getByTestId('app-loader-retry');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // Disabled + label flip while the promise is pending.
    expect(retry).toBeDisabled();
    expect(retry.textContent).toMatch(/Retrying/i);
    await act(async () => { release(); });
  });

  test('Sign-out button invokes onSignOut and disables the button while in-flight', async () => {
    let release;
    const onSignOut = jest.fn(() => new Promise((r) => { release = r; }));
    render(<AppLoader mode="recovery" onRetry={() => {}} onSignOut={onSignOut} />);
    const signOut = screen.getByTestId('app-loader-signout');
    fireEvent.click(signOut);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(signOut).toBeDisabled();
    expect(signOut.textContent).toMatch(/Signing out/i);
    await act(async () => { release(); });
  });

  test('Reload button uses the onReload prop when provided, falling back to window.reload', () => {
    const onReload = jest.fn();
    render(<AppLoader mode="recovery" onRetry={() => {}} onSignOut={() => {}} onReload={onReload} />);
    fireEvent.click(screen.getByTestId('app-loader-reload'));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test('omitting onRetry hides the Retry button (no-op recovery is not useful)', () => {
    render(<AppLoader mode="recovery" onSignOut={() => {}} />);
    expect(screen.queryByTestId('app-loader-retry')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-loader-signout')).toBeInTheDocument();
    expect(screen.getByTestId('app-loader-reload')).toBeInTheDocument();
  });

  test('omitting onSignOut hides the Sign-out button', () => {
    render(<AppLoader mode="recovery" onRetry={() => {}} />);
    expect(screen.getByTestId('app-loader-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('app-loader-signout')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-loader-reload')).toBeInTheDocument();
  });
});
