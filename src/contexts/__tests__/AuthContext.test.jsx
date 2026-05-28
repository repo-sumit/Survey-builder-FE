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
const { CACHE_KEY } = require('../../services/lastVerifiedUserCache');

const Probe = () => {
  const { user, loading, authReason, authWarning } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user ? user.role : 'null'}</div>
      <div data-testid="reason">{authReason || 'none'}</div>
      <div data-testid="warning">{authWarning || 'none'}</div>
    </div>
  );
};

/** Seed the lastVerifiedUser cache for stale-while-revalidate tests. */
function seedCache(user, supabaseUserId = 'sb-uuid-1', email = user?.email || 'a@b.com') {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    user,
    verifiedAt: Date.now(),
    supabaseUserId,
    email
  }));
}

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

  test('successful /me writes the lastVerifiedUser cache for the next boot', async () => {
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    authAPI.me.mockResolvedValue({ id: 1, role: 'admin', email: 'a@b.com' });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('admin'));
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    expect(cached.user).toMatchObject({ role: 'admin', email: 'a@b.com' });
    expect(cached.supabaseUserId).toBe('sb-uuid-1');
    expect(cached.email).toBe('a@b.com');
    expect(typeof cached.verifiedAt).toBe('number');
    // Cache MUST NOT contain the access token.
    expect(localStorage.getItem(CACHE_KEY)).not.toContain('tok');
  });

  test('no Supabase session clears any pre-existing cache and settles unauthenticated', async () => {
    // Pre-seed a cache from a previous tab that has since signed out.
    seedCache({ id: 1, role: 'admin', email: 'a@b.com' });
    supabaseMod.supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(authAPI.me).not.toHaveBeenCalled();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});

describe('AuthContext stale-while-revalidate (cached user)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('valid cache + session ⇒ user rendered IMMEDIATELY, before /me resolves', async () => {
    // Cache exists, /me is deliberately slow — the user must NOT wait.
    seedCache({ id: 1, role: 'admin', email: 'a@b.com' });
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    let resolveMe;
    authAPI.me.mockReturnValue(new Promise((r) => { resolveMe = r; }));
    renderApp();
    // User shows up from cache before /me ever resolves.
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('admin'));
    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('warning').textContent).toBe('none');
    // Background /me is in flight.
    expect(authAPI.me).toHaveBeenCalledTimes(1);
    // Let it finish so the test cleans up without leaking the open promise.
    await act(async () => { resolveMe({ id: 1, role: 'admin', email: 'a@b.com' }); });
  });

  test('background /me success updates the cache (verifiedAt advances)', async () => {
    const userObj = { id: 1, role: 'admin', email: 'a@b.com' };
    seedCache(userObj);
    const cachedBefore = JSON.parse(localStorage.getItem(CACHE_KEY));
    // Make sure verifiedAt advances measurably.
    await new Promise((r) => setTimeout(r, 5));
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    authAPI.me.mockResolvedValue(userObj);
    renderApp();
    await waitFor(() => expect(authAPI.me).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      expect(cached.verifiedAt).toBeGreaterThan(cachedBefore.verifiedAt);
    });
    expect(screen.getByTestId('warning').textContent).toBe('none');
  });

  test('background /me 5xx ⇒ user STAYS rendered, authWarning="RECONNECTING", session preserved', async () => {
    // The whole point of SWR: a transient backend failure must not kick
    // the user out of the app shell.
    seedCache({ id: 1, role: 'admin', email: 'a@b.com' });
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue({ response: { status: 503 } });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('warning').textContent).toBe('RECONNECTING'));
    // User is STILL rendered.
    expect(screen.getByTestId('user').textContent).toBe('admin');
    // No full-screen recovery — reason stays null.
    expect(screen.getByTestId('reason').textContent).toBe('none');
    // Cache stays in place — the user was previously verified.
    expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
    // Session was preserved (no purge on transient failure).
    expect(supabaseMod.signOutSupabase).not.toHaveBeenCalled();
  });

  test('background /me network error ⇒ same recoverable behavior as 5xx', async () => {
    seedCache({ id: 1, role: 'admin', email: 'a@b.com' });
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue(new Error('Network Error'));
    renderApp();
    await waitFor(() => expect(screen.getByTestId('warning').textContent).toBe('RECONNECTING'));
    expect(screen.getByTestId('user').textContent).toBe('admin');
    expect(screen.getByTestId('reason').textContent).toBe('none');
    expect(supabaseMod.signOutSupabase).not.toHaveBeenCalled();
  });

  test('background /me 401 ⇒ purges everything (cache, session) and user becomes null', async () => {
    // 401 is authoritative — token is no good. Even with a cached user,
    // we MUST log them out so the next request can't replay the dead
    // token.
    seedCache({ id: 1, role: 'admin', email: 'a@b.com' });
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue({ response: { status: 401 } });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('null'));
    expect(screen.getByTestId('reason').textContent).toBe('none');
    expect(screen.getByTestId('warning').textContent).toBe('none');
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  test('background /me 403 NOT_INVITED ⇒ purges cache + sets access-denied reason', async () => {
    seedCache({ id: 1, role: 'admin', email: 'a@b.com' });
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue({ response: { status: 403, data: { error: 'NOT_INVITED' } } });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('reason').textContent).toBe('NOT_INVITED'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
  });

  test('expired cache is ignored — strict foreground boot resumes', async () => {
    // Seed a cache that's already 9 hours old.
    const oldUser = { id: 1, role: 'admin', email: 'a@b.com' };
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      user: oldUser,
      verifiedAt: Date.now() - (9 * 60 * 60 * 1000),
      supabaseUserId: 'sb-uuid-1',
      email: 'a@b.com'
    }));
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    let resolveMe;
    authAPI.me.mockReturnValue(new Promise((r) => { resolveMe = r; }));
    renderApp();
    // Loading stays true until /me resolves — no instant cache render.
    await waitFor(() => expect(authAPI.me).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('loading').textContent).toBe('true');
    // The expired cache must have been evicted.
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    await act(async () => { resolveMe({ id: 1, role: 'admin', email: 'a@b.com' }); });
  });

  test('cache/session identity mismatch is ignored — strict foreground boot', async () => {
    // Cache says user A, session says user B (e.g. someone signed out
    // and signed back in as a different account on the same machine).
    seedCache({ id: 1, role: 'admin', email: 'old@a.com' }, 'sb-old-uuid', 'old@a.com');
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-new-uuid', email: 'new@b.com' }, access_token: 'tok' } }
    });
    let resolveMe;
    authAPI.me.mockReturnValue(new Promise((r) => { resolveMe = r; }));
    renderApp();
    await waitFor(() => expect(authAPI.me).toHaveBeenCalledTimes(1));
    // Identity mismatch ⇒ no cached user surfaced (foreground boot in flight).
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('loading').textContent).toBe('true');
    // Mismatched cache was evicted.
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    await act(async () => { resolveMe({ id: 2, role: 'state', email: 'new@b.com' }); });
  });

  test('logout clears the lastVerifiedUser cache', async () => {
    seedCache({ id: 1, role: 'admin', email: 'a@b.com' });
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    authAPI.me.mockResolvedValue({ id: 1, role: 'admin', email: 'a@b.com' });
    let logoutFn;
    const Capture = () => { logoutFn = useAuth().logout; return null; };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
          <Capture />
        </AuthProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('admin'));
    expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
    await act(async () => { await logoutFn(); });
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  test('Retry from RECONNECTING state revalidates without dropping the user (still cached on second failure)', async () => {
    seedCache({ id: 1, role: 'admin', email: 'a@b.com' });
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' } }
    });
    // Both background calls fail with 5xx.
    authAPI.me.mockRejectedValue({ response: { status: 503 } });
    let retryFn;
    const Capture = () => { retryFn = useAuth().retryBoot; return null; };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
          <Capture />
        </AuthProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByTestId('warning').textContent).toBe('RECONNECTING'));
    expect(screen.getByTestId('user').textContent).toBe('admin');
    // Retry — second 503 still keeps the user visible (banner re-arms).
    await act(async () => { await retryFn(); });
    expect(screen.getByTestId('user').textContent).toBe('admin');
    expect(screen.getByTestId('warning').textContent).toBe('RECONNECTING');
    expect(screen.getByTestId('reason').textContent).toBe('none');
  });
});

describe('AuthContext bootstrap (legacy / no-cache paths)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
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

  test('boot never hangs even if /me never resolves; settles in BOOT_TIMEOUT WITHOUT purging', async () => {
    // This is the cornerstone of the stuck-loader fix. Previously a slow
    // cold start tripped the timeout and PURGED the Supabase session,
    // dumping the user at /login — the worst possible UX for a transient
    // backend hiccup. New contract: loading still settles within the
    // deadline, but the session is PRESERVED so the user can Retry from
    // the recovery loader without re-authenticating.
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
    // CRITICAL: NO purge on a transient timeout. The user keeps their
    // Supabase session and can Retry without re-auth.
    expect(supabaseMod.signOutSupabase).not.toHaveBeenCalled();
    // Two attempts made (first slow → retry).
    expect(authAPI.me).toHaveBeenCalledTimes(2);
  });

  test('/me 401 purges the session and settles unauthenticated with no banner', async () => {
    // 401 is an authoritative "this token is no good" — drop everything
    // so the route guard sends the user to /login. No access-denied
    // banner reason — /login handles its own copy.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue({
      response: { status: 401, data: { error: 'Invalid or expired token' } }
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('reason').textContent).toBe('none');
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
  });

  test('/me 5xx KEEPS session and settles in recoverable ERROR state', async () => {
    // Transient server failure — same recoverable contract as a timeout.
    // The user can Retry without re-auth.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue({
      response: { status: 503, data: { error: 'Database unavailable' } }
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('reason').textContent).toBe('ERROR');
    expect(supabaseMod.signOutSupabase).not.toHaveBeenCalled();
  });

  test('/me network error KEEPS session and settles in recoverable ERROR state', async () => {
    // No response (e.g. DNS failure, fetch threw) — recoverable.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue(new Error('Network Error'));
    renderApp();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('reason').textContent).toBe('ERROR');
    expect(supabaseMod.signOutSupabase).not.toHaveBeenCalled();
  });

  test('retryBoot from a recoverable state re-runs warmup + /me and resolves to user', async () => {
    // The recovery loader's Retry button calls retryBoot. This test
    // proves the round-trip: first /me fails recoverably (5xx), the
    // user retries, second /me succeeds, AuthContext lands on
    // authenticated without losing the Supabase session in between.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    let meCallCount = 0;
    authAPI.me.mockImplementation(() => {
      meCallCount += 1;
      if (meCallCount === 1) {
        return Promise.reject({ response: { status: 503, data: { error: 'Database unavailable' } } });
      }
      return Promise.resolve({ role: 'state', email: 's@b.com' });
    });

    let retryFn;
    const Capture = () => {
      retryFn = useAuth().retryBoot;
      return null;
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
          <Capture />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Initial boot lands in recoverable ERROR.
    await waitFor(() => expect(screen.getByTestId('reason').textContent).toBe('ERROR'));
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(supabaseMod.signOutSupabase).not.toHaveBeenCalled();

    // Retry → second /me succeeds → authenticated.
    await act(async () => { await retryFn(); });
    expect(screen.getByTestId('user').textContent).toBe('state');
    expect(screen.getByTestId('reason').textContent).toBe('none');
    expect(authAPI.me).toHaveBeenCalledTimes(2);
  });

  test('retryBoot clears reason and re-enters loading=true during the attempt', async () => {
    // The recovery flow must visibly return to a working state — the
    // spinner reappears, the reason banner clears — so the user knows
    // their click did something.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    let resolveSecondMe;
    let meCallCount = 0;
    authAPI.me.mockImplementation(() => {
      meCallCount += 1;
      if (meCallCount === 1) {
        return Promise.reject({ response: { status: 503 } });
      }
      // Block the retry's /me call so we can observe loading=true mid-retry.
      return new Promise((resolve) => { resolveSecondMe = resolve; });
    });

    let retryFn;
    const Capture = () => {
      retryFn = useAuth().retryBoot;
      return null;
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
          <Capture />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByTestId('reason').textContent).toBe('ERROR'));

    // Fire retry but don't await it yet — we want to observe the
    // intermediate loading=true state.
    let retryPromise;
    act(() => { retryPromise = retryFn(); });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('true'));
    expect(screen.getByTestId('reason').textContent).toBe('none');

    // Now let the second /me resolve.
    await act(async () => {
      resolveSecondMe({ role: 'admin', email: 'a@b.com' });
      await retryPromise;
    });
    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('admin');
  });

  test('logout from a recoverable state purges and settles unauthenticated', async () => {
    // The recovery loader's "Sign out" button calls logout. Verifies the
    // existing logout flow purges sb-* localStorage keys, sessionStorage,
    // and Supabase session — even when initiated from a recoverable
    // (non-401) failure state.
    supabaseMod.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } }
    });
    authAPI.me.mockRejectedValue({ response: { status: 503 } });
    localStorage.setItem('sb-xxx-auth-token', 'stale');

    let logoutFn;
    const Capture = () => {
      logoutFn = useAuth().logout;
      return null;
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
          <Capture />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByTestId('reason').textContent).toBe('ERROR'));
    expect(localStorage.getItem('sb-xxx-auth-token')).toBe('stale'); // still there pre-logout

    await act(async () => { await logoutFn(); });
    expect(localStorage.getItem('sb-xxx-auth-token')).toBeNull();
    expect(supabaseMod.signOutSupabase).toHaveBeenCalled();
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('reason').textContent).toBe('none');
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
