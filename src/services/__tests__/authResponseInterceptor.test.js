/* eslint-env jest */
/**
 * Tests for the refresh-on-401 response-interceptor policy.
 *
 * The handler is dependency-injected, which lets us drive every branch
 * deterministically (no real axios, no real Supabase) and assert exactly
 * which side effects happened — including the order of refresh → retry →
 * sign-out.
 *
 * Threat models locked in here:
 *   - Auth bootstrap / public probes never trigger refresh or sign-out.
 *   - 5xx / network / timeout (no response) never trigger refresh or
 *     sign-out (the SWR banner handles those).
 *   - 403 never triggers refresh — that's authoritative RBAC, not a token
 *     issue.
 *   - At most ONE refresh attempt per request; a retried request that
 *     still 401s is treated as an authoritative rejection.
 *   - Refresh that yields no new token signs out; the retried request
 *     is never sent with a stale or null token.
 */
const { createOn401Refresh, REFRESH_FLAG } = require('../authResponseInterceptor');

function build(overrides = {}) {
  const isPublicApiPath = overrides.isPublicApiPath || (() => false);
  const refreshSession = overrides.refreshSession || jest.fn().mockResolvedValue(null);
  const signOut = overrides.signOut || jest.fn().mockResolvedValue(undefined);
  const redirectToLogin = overrides.redirectToLogin || jest.fn();
  const request = overrides.request || jest.fn().mockResolvedValue({ status: 200, data: 'retried' });
  const handler = createOn401Refresh({ isPublicApiPath, refreshSession, signOut, redirectToLogin, request });
  return { handler, isPublicApiPath, refreshSession, signOut, redirectToLogin, request };
}

function err401(url = '/api/surveys', overrides = {}) {
  return {
    response: { status: 401, data: { error: 'Token expired' } },
    config: { url, method: 'get', headers: {}, ...overrides }
  };
}

describe('on401Refresh — endpoints that must NEVER trigger refresh or sign-out', () => {
  test('/auth/me 401 is passed through unchanged (AuthContext owns the bootstrap)', async () => {
    const { handler, refreshSession, signOut, redirectToLogin } = build();
    await expect(handler(err401('/api/auth/me'))).rejects.toMatchObject({
      response: { status: 401 }
    });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(redirectToLogin).not.toHaveBeenCalled();
  });

  test('/auth/login 401 is passed through unchanged', async () => {
    const { handler, refreshSession, signOut } = build();
    await expect(handler(err401('/api/auth/login'))).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  test('public endpoints (health/ready/keep-alive) skip refresh entirely', async () => {
    const { handler, refreshSession, signOut } = build({
      isPublicApiPath: (u) => ['/api/health', '/api/ready', '/api/keep-alive'].includes(u)
    });
    for (const url of ['/api/health', '/api/ready', '/api/keep-alive']) {
      await expect(handler(err401(url))).rejects.toBeTruthy();
    }
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('on401Refresh — non-401 status codes never refresh or sign out', () => {
  test('403 propagates unchanged (RBAC, not a token issue)', async () => {
    const { handler, refreshSession, signOut } = build();
    const e = { response: { status: 403, data: { error: 'NOT_INVITED' } }, config: { url: '/api/surveys', headers: {} } };
    await expect(handler(e)).rejects.toBe(e);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  test('5xx propagates unchanged (transient — SWR banner owns this)', async () => {
    const { handler, refreshSession, signOut } = build();
    const e = { response: { status: 503 }, config: { url: '/api/surveys', headers: {} } };
    await expect(handler(e)).rejects.toBe(e);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  test('network error (no response) propagates unchanged', async () => {
    const { handler, refreshSession, signOut } = build();
    const e = { request: {}, message: 'Network Error', config: { url: '/api/surveys', headers: {} } };
    await expect(handler(e)).rejects.toBe(e);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('on401Refresh — happy refresh path', () => {
  test('first 401 triggers refreshSession, then retries the original request with the new token', async () => {
    const refreshSession = jest.fn().mockResolvedValue({ access_token: 'fresh-token' });
    const request = jest.fn().mockResolvedValue({ status: 200, data: 'after-retry' });
    const { handler, signOut, redirectToLogin } = build({ refreshSession, request });

    const result = await handler(err401('/api/surveys', { headers: { 'X-Trace': 'abc' } }));

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    const sentConfig = request.mock.calls[0][0];
    // Authorization header is replaced with the fresh token.
    expect(sentConfig.headers.Authorization).toBe('Bearer fresh-token');
    // Other headers are preserved.
    expect(sentConfig.headers['X-Trace']).toBe('abc');
    // The retry sentinel is set so a second 401 won't loop.
    expect(sentConfig[REFRESH_FLAG]).toBe(true);
    // No sign-out / redirect on the happy path.
    expect(signOut).not.toHaveBeenCalled();
    expect(redirectToLogin).not.toHaveBeenCalled();
    expect(result).toMatchObject({ data: 'after-retry' });
  });
});

describe('on401Refresh — refresh failure paths', () => {
  test('refreshSession returns null ⇒ sign-out + redirect, no retry sent', async () => {
    const refreshSession = jest.fn().mockResolvedValue(null);
    const request = jest.fn();
    const { handler, signOut, redirectToLogin } = build({ refreshSession, request });

    await expect(handler(err401())).rejects.toBeTruthy();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });

  test('refreshSession throws ⇒ sign-out + redirect, no retry sent', async () => {
    const refreshSession = jest.fn().mockRejectedValue(new Error('network down'));
    const request = jest.fn();
    const { handler, signOut, redirectToLogin } = build({ refreshSession, request });

    await expect(handler(err401())).rejects.toBeTruthy();

    expect(request).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });

  test('refresh succeeds but session has no access_token ⇒ sign-out + redirect', async () => {
    const refreshSession = jest.fn().mockResolvedValue({}); // no access_token field
    const request = jest.fn();
    const { handler, signOut, redirectToLogin } = build({ refreshSession, request });

    await expect(handler(err401())).rejects.toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });
});

describe('on401Refresh — loop guard', () => {
  test('a request already tagged with _authRetry that 401s again goes straight to sign-out (no second refresh)', async () => {
    const refreshSession = jest.fn();
    const request = jest.fn();
    const { handler, signOut, redirectToLogin } = build({ refreshSession, request });

    const alreadyRetried = err401('/api/surveys', { [REFRESH_FLAG]: true });
    await expect(handler(alreadyRetried)).rejects.toBeTruthy();

    expect(refreshSession).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });

  test('end-to-end loop scenario: first 401 refreshes, retry still 401, no third refresh', async () => {
    // Mimics what would happen if Supabase issued a token that the backend
    // still rejects — we MUST NOT refresh again, just sign the user out.
    const refreshSession = jest.fn().mockResolvedValue({ access_token: 'fresh-token' });
    const request = jest.fn(); // simulate retry getting another 401
    const { handler, signOut, redirectToLogin } = build({ refreshSession, request });

    // First handler invocation — does the refresh and retries.
    request.mockImplementationOnce(async (cfg) => {
      // Caller would have given the retried config to axios; in the real
      // world axios re-enters the response interceptor with that config
      // when it 401s again. We simulate that by running our handler with
      // the retried config carrying _authRetry=true.
      const secondErr = { response: { status: 401 }, config: cfg };
      return handler(secondErr);
    });

    await expect(handler(err401())).rejects.toBeTruthy();

    expect(refreshSession).toHaveBeenCalledTimes(1); // ONE refresh total
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });
});
