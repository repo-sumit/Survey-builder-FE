/**
 * Response-interceptor logic for the Axios client.
 *
 * Extracted into its own module so the 401-refresh-and-retry policy can
 * be unit-tested without dragging axios (CRA Jest can't transform the
 * ESM in axios v1) into the test runtime.
 *
 * Policy:
 *   1. NEVER refresh-or-retry the auth bootstrap (/auth/me, /auth/login).
 *      AuthContext owns its own retry semantics for /me.
 *   2. NEVER refresh-or-retry public endpoints (/api/health, /api/ready,
 *      /api/keep-alive). They aren't authed in the first place.
 *   3. ONLY refresh on 401. 403 (and 5xx, timeout, network) never trigger
 *      a refresh or sign-out — 403 means RBAC rejected this human, 5xx
 *      means the backend hiccuped (recoverable via the SWR banner).
 *   4. Refresh at most ONCE per request lifecycle. The retried request is
 *      tagged with `_retried = true`; if it 401s again, we sign out.
 *   5. Refresh failure (no new token) ⇒ sign out.
 *
 * Dependencies injected via the factory so tests can stub them cleanly
 * without monkey-patching modules. Production wiring in `api.js` injects
 * the real axios instance + Supabase client.
 */

export const REFRESH_FLAG = '_authRetry';

/**
 * Build the response error handler.
 *
 * @param {object} deps
 * @param {(url: string) => boolean} deps.isPublicApiPath
 *   Matches the public/skip-list (health/ready/keep-alive).
 * @param {() => Promise<{ access_token?: string } | null>} deps.refreshSession
 *   Supabase refreshSession wrapper. Must return the new session or null.
 * @param {() => Promise<void>} deps.signOut
 *   Idempotent sign-out; safe to call from anywhere.
 * @param {() => void} deps.redirectToLogin
 *   Effectful navigation (`window.location.href = '/login'`) — injected
 *   so tests can observe it without touching jsdom navigation.
 * @param {(config: object) => Promise<any>} deps.request
 *   The axios instance bound for retry. `(config) => axios(config)`.
 */
export function createOn401Refresh(deps) {
  const { isPublicApiPath, refreshSession, signOut, redirectToLogin, request } = deps;

  return async function on401Refresh(error) {
    const config = error && error.config;
    const status = error?.response?.status;
    const requestUrl = typeof config?.url === 'string' ? config.url : '';

    // Bootstrap and public probes: never refresh, never sign out. Let
    // the caller see the raw rejection.
    const isAuthBootstrap =
      requestUrl.includes('/auth/me') || requestUrl.includes('/auth/login');
    const isPublic = isPublicApiPath(requestUrl);

    if (isAuthBootstrap || isPublic) {
      return Promise.reject(error);
    }

    // Only 401 triggers the refresh path. Everything else (403, 5xx,
    // timeouts with no response, network errors) propagates unchanged.
    if (status !== 401) {
      return Promise.reject(error);
    }

    // Avoid infinite loops: if we already retried this request, sign out.
    if (!config || config[REFRESH_FLAG]) {
      try { await signOut(); } catch { /* ignore */ }
      try { redirectToLogin(); } catch { /* ignore */ }
      return Promise.reject(error);
    }

    // Attempt refresh.
    let newToken = null;
    try {
      const session = await refreshSession();
      newToken = session && session.access_token ? session.access_token : null;
    } catch {
      newToken = null;
    }

    if (!newToken) {
      // Refresh failed — token can't be rotated. Sign out and redirect.
      try { await signOut(); } catch { /* ignore */ }
      try { redirectToLogin(); } catch { /* ignore */ }
      return Promise.reject(error);
    }

    // Retry the original request once, with the new token AND the
    // sentinel flag so a second 401 lands in the sign-out branch above.
    const retried = {
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${newToken}`
      },
      [REFRESH_FLAG]: true
    };
    return request(retried);
  };
}
