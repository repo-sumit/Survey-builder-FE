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
    hasPersistedSupabaseSession: jest.fn(() => false),
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

// Renders the same tree wrapped in React.StrictMode so each effect runs
// setup → cleanup → setup again on mount. Used to lock in Phase 5.6's
// regression: previously, the boot effect's cancelled-flag plus
// bootedRef early-return left the dev tree stuck at loading=true.
const renderAppStrict = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <React.StrictMode>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>
    </React.StrictMode>
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

  test('boot never hangs even if /me never resolves (timeout fallback after retry)', async () => {
    jest.useFakeTimers();
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    // Both attempts hang — the retry-once path eventually settles via deadline.
    authAPI.me.mockReturnValue(new Promise(() => {}));
    renderApp();

    expect(screen.getByTestId('loading').textContent).toBe('true');

    // Trigger the first deadline (6s), let microtasks flush so the catch
    // block schedules the retry attempt, then trigger the second deadline (12s).
    await act(async () => { jest.advanceTimersByTime(7_000); });
    await act(async () => { jest.advanceTimersByTime(13_000); });
    jest.useRealTimers();

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('reason').textContent).toBe('BOOT_TIMEOUT');
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
    // Two attempts made (first slow → retry).
    expect(authAPI.me).toHaveBeenCalledTimes(2);
  });

  test('cold-backend warmup: first /me times out, second resolves — user is admin', async () => {
    // Use real timers so chained microtasks settle naturally. The first call
    // is deliberately delayed past ME_TIMEOUT_FIRST_MS (6s) via a 7s setTimeout;
    // the retry then resolves immediately. Slow but reliable.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    let callCount = 0;
    authAPI.me.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => setTimeout(
          () => resolve({ role: 'state', email: 'should-be-ignored@b.com' }),
          7_000
        ));
      }
      return Promise.resolve({ role: 'admin', email: 'a@b.com' });
    });
    renderApp();
    expect(screen.getByTestId('loading').textContent).toBe('true');

    await waitFor(
      () => expect(screen.getByTestId('user').textContent).toBe('admin'),
      { timeout: 15_000 }
    );
    expect(screen.getByTestId('reason').textContent).toBe('none');
    expect(authAPI.me).toHaveBeenCalledTimes(2);
  }, 20_000);

  test('boot calls warmup BEFORE /me when a Supabase session exists', async () => {
    // The cold-start optimisation: AuthContext serialises /api/health in
    // front of /api/auth/me so the cold-start wait lands on the cheap
    // public endpoint, not on the auth bootstrap probe.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    const callOrder = [];
    authAPI.warmup.mockImplementation(() => {
      callOrder.push('warmup');
      return Promise.resolve(true);
    });
    authAPI.me.mockImplementation(() => {
      callOrder.push('me');
      return Promise.resolve({ role: 'admin', email: 'a@b.com' });
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('admin'));
    expect(callOrder).toEqual(['warmup', 'me']);
    expect(authAPI.warmup).toHaveBeenCalledTimes(1);
  });

  test('boot does NOT call warmup when there is no Supabase session', async () => {
    // Unauthenticated mounts shouldn't pre-warm — there is no upcoming
    // authed call to protect, and idle pings would add to Render free-tier
    // usage. We just settle unauthenticated immediately.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(authAPI.warmup).not.toHaveBeenCalled();
    expect(authAPI.me).not.toHaveBeenCalled();
  });

  test('boot tolerates a failing warmup and still proceeds to /me', async () => {
    // Warmup failure (network blip, BE 5xx) must not block auth bootstrap.
    // /me is the gate; the BE remains source of truth.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.warmup.mockRejectedValueOnce(new Error('boom'));
    authAPI.me.mockResolvedValue({ role: 'state', email: 's@b.com' });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('state'));
    expect(authAPI.warmup).toHaveBeenCalledTimes(1);
    expect(authAPI.me).toHaveBeenCalledTimes(1);
  });

  test('hasPersistedSession flag is exposed from the synchronous storage hint', async () => {
    supabaseMod.hasPersistedSupabaseSession.mockReturnValueOnce(true);
    supabaseMod.supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    let captured = null;
    const HintProbe = () => {
      captured = useAuth();
      return null;
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <HintProbe />
        </AuthProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(captured && captured.loading).toBe(false));
    expect(captured.hasPersistedSession).toBe(true);
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

describe('AuthContext bootstrap — React 18 StrictMode (Phase 5.6 regression)', () => {
  // Phase 5.6 root-cause: in dev, the boot effect's first invocation set
  // cancelled=true on strict-cleanup, and the second invocation
  // early-returned via bootedRef — so the only path to setLoading(false)
  // (gated on `!cancelled`) was skipped. App stayed loading=true forever.
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('unauthenticated boot under StrictMode still settles loading=false', async () => {
    supabaseMod.supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderAppStrict();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(authAPI.me).not.toHaveBeenCalled();
  });

  test('valid session boot under StrictMode resolves to user + loading=false', async () => {
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.me.mockResolvedValue({ role: 'admin', email: 'a@b.com' });
    renderAppStrict();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('admin'));
    expect(screen.getByTestId('loading').textContent).toBe('false');
    // resolvingRef guards /me from being called twice even if both
    // strict-mount invocations attempted to boot.
    expect(authAPI.me).toHaveBeenCalledTimes(1);
  });

  test('403 NOT_INVITED under StrictMode sets the reason banner AND settles loading', async () => {
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue({ response: { status: 403, data: { error: 'NOT_INVITED' } } });
    renderAppStrict();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('reason').textContent).toBe('NOT_INVITED');
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
  });
});
