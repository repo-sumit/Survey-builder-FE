/* eslint-env jest */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../AuthContext';

// --- Module mocks ------------------------------------------------------------

jest.mock('../../services/api', () => ({
  __esModule: true,
  authAPI: {
    me: jest.fn(),
    loginWithGoogle: jest.fn(),
    warmup: jest.fn().mockResolvedValue(true)
  }
}));

jest.mock('../../services/supabaseClient', () => {
  const listeners = [];
  return {
    __esModule: true,
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        getSession: jest.fn(),
        onAuthStateChange: (cb) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe: () => {} } } };
        }
      }
    },
    signOutSupabase: jest.fn().mockResolvedValue(undefined),
    __listeners: listeners
  };
});

const { authAPI } = require('../../services/api');
const supabaseMod = require('../../services/supabaseClient');

const Probe = () => {
  const { user, loading, authReason } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user ? user.role : 'null'}</div>
      <div data-testid="reason">{authReason || 'none'}</div>
    </div>
  );
};

const renderApp = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('AuthContext bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('unauthenticated boot: no session → loading=false, user=null', async () => {
    supabaseMod.supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(authAPI.me).not.toHaveBeenCalled();
  });

  test('authenticated boot: valid session → /me returns admin', async () => {
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.me.mockResolvedValue({ role: 'admin', email: 'a@b.com' });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('admin'));
    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('reason').textContent).toBe('none');
  });

  test('boot resolves to unauthenticated when /me returns 403 NOT_INVITED', async () => {
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue({
      response: { status: 403, data: { error: 'NOT_INVITED' } }
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('reason').textContent).toBe('NOT_INVITED');
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
  });

  test('boot never hangs even if /me never resolves (timeout fallback)', async () => {
    jest.useFakeTimers();
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    // Hanging promise — would block forever without the BOOT_TIMEOUT_MS race.
    authAPI.me.mockReturnValue(new Promise(() => {}));
    renderApp();

    expect(screen.getByTestId('loading').textContent).toBe('true');

    await act(async () => {
      jest.advanceTimersByTime(10_000); // > BOOT_TIMEOUT_MS (8s)
    });
    jest.useRealTimers();

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('reason').textContent).toBe('BOOT_TIMEOUT');
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
  });
});

describe('AuthContext.logout', () => {
  test('clears sb-* localStorage keys, sessionStorage, and Supabase session', async () => {
    supabaseMod.supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    localStorage.setItem('sb-xxx-auth-token', 'stale');
    localStorage.setItem('app-pref-theme', 'dark'); // must be preserved
    sessionStorage.setItem('scratch', 'data');

    let logoutFn;
    const Capture = () => {
      logoutFn = useAuth().logout;
      return null;
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Capture />
        </AuthProvider>
      </QueryClientProvider>
    );

    await act(async () => { await logoutFn(); });

    expect(localStorage.getItem('sb-xxx-auth-token')).toBeNull();
    expect(sessionStorage.getItem('scratch')).toBeNull();
    expect(localStorage.getItem('app-pref-theme')).toBe('dark');
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
  });
});
