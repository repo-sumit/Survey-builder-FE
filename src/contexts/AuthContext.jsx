import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authAPI } from '../services/api';
import {
  supabase,
  isSupabaseConfigured,
  signOutSupabase,
  hasPersistedSupabaseSession
} from '../services/supabaseClient';

const AuthContext = createContext(null);

/**
 * Boot timing — staged so we never feel stuck and never give up too early
 * on a cold Render backend:
 *   - When a persisted Supabase session exists, we first hit a lightweight
 *     warmup probe (/api/health) bounded by WARMUP_TIMEOUT_MS. This serialises
 *     the cold-start wait onto a public, DB-free, auth-free endpoint so that
 *     the subsequent /me runs against a (likely) warm BE. Warmup failure is
 *     tolerated — we still attempt /me — because the BE is the source of truth.
 *   - First `/me` attempt races against ME_TIMEOUT_FIRST_MS.
 *   - On timeout we DO NOT purge — we retry once with ME_TIMEOUT_SECOND_MS,
 *     since the most common cause is a cold backend (10–15s wake-up).
 *   - Total worst-case bootstrap is bounded by BOOT_TIMEOUT_MS.
 *
 * Note on BOOT_TIMEOUT_MS = 20s:
 *   In the warm-BE case (and the common cold-but-fast-wake case), warmup
 *   resolves in well under 1 s, leaving 18 s of headroom for the staged /me
 *   retry (6 + 12). On a truly slow cold wake (>20 s), the boot will settle
 *   into a "timeout_recoverable" state (NOT a logout — see resolveProfile
 *   error classification) and the user gets Retry / Sign out / Reload
 *   buttons on the loader. We deliberately kept this at 20 s rather than
 *   raising it: a longer silent wait is more frustrating than an explicit
 *   recovery prompt, and the GitHub Actions keep-awake workflow (see
 *   docs/UPTIME_MONITORING.md) means cold starts should be rare in normal
 *   operation.
 */
const WARMUP_TIMEOUT_MS = 8000;
const ME_TIMEOUT_FIRST_MS = 6000;
const ME_TIMEOUT_SECOND_MS = 12000;
const BOOT_TIMEOUT_MS = 20000;

/**
 * authReason — the categorical outcome of a settled boot or retry. Drives
 * route-guard behavior (redirect to /access-denied, /login, or stay and
 * render the recovery UI). UI never trusts this for authorization.
 *
 * | reason         | session preserved? | next UI                  |
 * |----------------|--------------------|--------------------------|
 * | null           | n/a                | normal (user or /login)  |
 * | NOT_INVITED    | no — purged        | /access-denied           |
 * | INACTIVE       | no — purged        | /access-denied           |
 * | DOMAIN_BLOCKED | no — purged        | /access-denied           |
 * | BOOT_TIMEOUT   | YES — preserved    | recovery loader (Retry…) |
 * | ERROR          | YES — preserved    | recovery loader (Retry…) |
 *
 * "Recoverable" reasons (BOOT_TIMEOUT, ERROR) are the critical fix for the
 * stuck-loader bug — previously every timeout purged the session and
 * dumped the user at /login. They can now Retry without a page reload.
 */
export const AUTH_RECOVERABLE_REASONS = ['BOOT_TIMEOUT', 'ERROR'];

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function deadline(ms, label) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(label || 'AUTH_BOOT_TIMEOUT')), ms)
  );
}

/**
 * Wipe every browser auth artifact we know about. Designed to be safe to call
 * even when the user has never signed in. We DON'T blindly `localStorage.clear()`
 * — that would nuke unrelated app preferences. Instead we target:
 *   - any localStorage key starting with `sb-` (Supabase client persistence)
 *   - the legacy `token` key (defensive — removed from the codebase but a
 *     returning user may still have it cached)
 *   - sessionStorage entirely (no app-level data lives there today)
 *   - Supabase server-side session via signOut
 */
async function purgeBrowserAuthArtifacts() {
  try { await signOutSupabase(); } catch (e) { /* ignore */ }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('sb-') || key === 'token') {
        localStorage.removeItem(key);
      }
    }
    sessionStorage.clear();
  } catch (e) {
    console.warn('[auth] storage cleanup failed', e);
  }
}

/**
 * Classify a resolveProfile error so the boot pipeline can make exactly
 * one decision per failure mode. The classification determines two things:
 *   - `purge`: whether to wipe Supabase storage + sign out.
 *   - `reason`: which authReason to surface (null = no banner / generic).
 *
 * The cardinal rule: a transient backend hiccup (timeout, 5xx, network
 * blip) must NEVER purge — that's the bug this whole refactor is fixing.
 * Only authoritative server signals (401 = bad/expired token, 403 with a
 * canonical code = user-level rejection) cause a purge.
 */
function classifyMeError(err) {
  // Our own deadline marker — kept session, recoverable, can Retry.
  if (err && err.message === 'ME_TIMEOUT') {
    return { purge: false, reason: 'BOOT_TIMEOUT' };
  }
  const status = err?.response?.status;
  const code = err?.response?.data?.error;
  if (status === 401) {
    // Authoritative "this token is no good." Drop everything and let the
    // route guard send the user to /login. No banner — /login carries its
    // own copy via authReason if applicable.
    return { purge: true, reason: null };
  }
  if (status === 403 && code) {
    // Authoritative "this human is not allowed." Drop the session and
    // surface the canonical reason so the route guard shows
    // /access-denied instead of /login.
    return { purge: true, reason: code };
  }
  if (status === 403) {
    // 403 with no canonical reason code — treat conservatively like an
    // unspecified denial. Purge to avoid loops, but no banner.
    return { purge: true, reason: null };
  }
  // 5xx, network errors, opaque CORS failures, axios timeouts that didn't
  // come from our own ME_TIMEOUT deadline — KEEP session, surface a
  // generic recoverable error so the user can Retry without re-auth.
  return { purge: false, reason: 'ERROR' };
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReason, setAuthReason] = useState(null);
  // Synchronous best-effort hint computed once at mount — used by route guards
  // to choose loader copy ("Restoring your session…" vs plain "Loading…"). NEVER
  // used as proof of identity; the backend is still the authority on every API.
  const [hasPersistedSession] = useState(() => hasPersistedSupabaseSession());
  const supabaseSessionRef = useRef(null);
  const resolvingRef = useRef(false);     // guard against duplicate /me calls
  const bootedRef = useRef(false);        // ensure boot only runs once

  /**
   * Ask the backend "who am I?". Single source of truth for role + state.
   *
   * Success path:
   *   - setUser(profile), clear authReason, return profile.
   *
   * Failure paths (classified via classifyMeError):
   *   - 401:            purge, setUser(null), no reason → guard redirects /login.
   *   - 403 + reason:   purge, setUser(null), reason set → /access-denied.
   *   - ME_TIMEOUT:     KEEP session, setUser(null), reason='BOOT_TIMEOUT'
   *                     → guard renders recovery loader with Retry.
   *   - other (5xx…):   KEEP session, setUser(null), reason='ERROR'
   *                     → guard renders recovery loader with Retry.
   *
   * On the first ME_TIMEOUT we transparently retry once with a longer
   * deadline (handles Render cold-start where one /me can take 10–15 s).
   * Only the second timeout surfaces BOOT_TIMEOUT to the UI.
   *
   * Always returns; never throws.
   */
  const resolveProfile = useCallback(async () => {
    if (resolvingRef.current) return null;
    resolvingRef.current = true;
    try {
      let profile;
      try {
        profile = await Promise.race([
          authAPI.me(),
          deadline(ME_TIMEOUT_FIRST_MS, 'ME_TIMEOUT')
        ]);
      } catch (firstErr) {
        // Only retry on our own deadline; for a real HTTP error, fall through.
        if (firstErr?.message !== 'ME_TIMEOUT') throw firstErr;
        if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.warn('[auth] /me slow — retrying once before giving up');
        }
        profile = await Promise.race([
          authAPI.me(),
          deadline(ME_TIMEOUT_SECOND_MS, 'ME_TIMEOUT')
        ]);
      }
      setUser(profile);
      setAuthReason(null);
      return profile;
    } catch (err) {
      const { purge, reason } = classifyMeError(err);
      if (purge) {
        await purgeBrowserAuthArtifacts();
      }
      setAuthReason(reason);
      setUser(null);
      return null;
    } finally {
      resolvingRef.current = false;
    }
  }, []);

  /**
   * Run the warmup probe (bounded by WARMUP_TIMEOUT_MS) and then /me.
   * Returns when the boot pipeline has settled — never throws.
   *
   * Extracted from the initial boot effect so it can be re-invoked by
   * `retryBoot` without re-running getSession() (we already have the
   * session in supabaseSessionRef).
   */
  const runWarmupThenResolve = useCallback(async () => {
    await new Promise((resolve) => {
      let timer;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve();
      };
      timer = setTimeout(() => {
        if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.warn('[auth] warmup timed out — proceeding to /me');
        }
        finish();
      }, WARMUP_TIMEOUT_MS);
      // Defensive: authAPI.warmup() might throw synchronously or return a
      // non-thenable in tests where mocks are reset. Either way, we want
      // to fall through to /me, not crash the boot.
      try {
        const warmP = authAPI.warmup();
        Promise.resolve(warmP).then(finish, (warmErr) => {
          if (process.env.NODE_ENV !== 'test') {
            // eslint-disable-next-line no-console
            console.warn('[auth] warmup failed — proceeding to /me', warmErr && warmErr.message);
          }
          finish();
        });
      } catch (warmErr) {
        if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.warn('[auth] warmup threw — proceeding to /me', warmErr && warmErr.message);
        }
        finish();
      }
    });
    await resolveProfile();
  }, [resolveProfile]);

  /**
   * Boot once + subscribe to Supabase auth events.
   *
   * Strict-mode / mount handling:
   *   - React 18 StrictMode synthetically unmounts + remounts the effect
   *     in development. Boot runs once across the strict double-mount
   *     (gated by `bootedRef`), and the Supabase auth subscription
   *     re-attaches on every effect invocation so the strict cleanup-
   *     then-resetup leaves us with a live listener at all times.
   *   - React 18 silently no-ops `setState` on truly-unmounted components,
   *     so we don't need a `cancelled` flag.
   *
   * Boot timeout handling:
   *   - The outer Promise.race against deadline(BOOT_TIMEOUT_MS) bounds the
   *     whole boot so a stalled Supabase getSession can't hang loading=true.
   *   - On AUTH_BOOT_TIMEOUT we set reason='BOOT_TIMEOUT' but DO NOT purge
   *     — same recoverable contract as the inner ME_TIMEOUT path. The user
   *     keeps their session and can Retry from the recovery loader.
   */
  useEffect(() => {
    if (!bootedRef.current) {
      bootedRef.current = true;

      const bootInner = async () => {
        if (isSupabaseConfigured && supabase) {
          const { data } = await supabase.auth.getSession();
          supabaseSessionRef.current = data?.session || null;
        }
        if (supabaseSessionRef.current) {
          await runWarmupThenResolve();
        }
      };

      (async () => {
        try {
          await Promise.race([bootInner(), deadline(BOOT_TIMEOUT_MS, 'AUTH_BOOT_TIMEOUT')]);
        } catch (err) {
          if (err && err.message === 'AUTH_BOOT_TIMEOUT') {
            // Outer deadline. KEEP session — same recoverable contract as
            // the inner ME_TIMEOUT path. The user can Retry from the
            // recovery loader without re-authenticating.
            // eslint-disable-next-line no-console
            console.warn('[auth] boot timeout — recoverable, session preserved');
            setAuthReason('BOOT_TIMEOUT');
            setUser(null);
          } else {
            // Unexpected exception in bootInner (not a timeout, not /me).
            // Treat as recoverable too — refuse to purge for an opaque
            // failure we don't understand.
            // eslint-disable-next-line no-console
            console.error('[auth] boot threw — recoverable, session preserved', err);
            setAuthReason('ERROR');
            setUser(null);
          }
        } finally {
          // ALWAYS settle loading. The state machine guarantees we land in
          // exactly one of: authenticated | unauthenticated | access_denied
          // | recoverable. No infinite spinner is possible past this point.
          setLoading(false);
        }
      })();
    }

    let sub;
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        supabaseSessionRef.current = session;
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await resolveProfile();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });
      sub = data?.subscription;
    }

    return () => {
      if (sub) sub.unsubscribe();
    };
    // resolveProfile / runWarmupThenResolve are stable (useCallback w/
    // empty deps chain). Run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Google sign-in is not configured.');
    }
    // Returns immediately; session arrives via onAuthStateChange after redirect.
    await authAPI.loginWithGoogle();
  }, []);

  /**
   * Logout — must clear ALL auth artifacts atomically. After this returns
   * the user must not be able to recover their session by URL-hopping.
   */
  const logout = useCallback(async () => {
    await purgeBrowserAuthArtifacts();
    setUser(null);
    setAuthReason(null);
    queryClient.clear();
  }, [queryClient]);

  /**
   * Re-run the boot pipeline from a recoverable state. Used by the
   * recovery loader's "Retry" button.
   *
   * Contract:
   *   - Goes back to loading=true so the spinner reappears immediately.
   *   - Re-uses the existing Supabase session in `supabaseSessionRef`
   *     (no need to re-call getSession — the session is still there;
   *     we never purged it on a recoverable failure).
   *   - Bounded by BOOT_TIMEOUT_MS exactly like the initial boot, so
   *     Retry can never re-introduce an infinite spinner.
   *   - On second-attempt failure, lands back in the same recoverable
   *     state. The user can Retry again or Sign out.
   *   - If there's no session at all (e.g. the user signed out between
   *     attempts) we settle unauthenticated quickly.
   */
  const retryBoot = useCallback(async () => {
    setLoading(true);
    setAuthReason(null);
    try {
      // Re-confirm the session is still in localStorage. The most common
      // path is "yes, still there"; if it's gone, settle unauthenticated.
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        supabaseSessionRef.current = data?.session || null;
      }
      if (!supabaseSessionRef.current) {
        setUser(null);
        return;
      }
      await Promise.race([
        runWarmupThenResolve(),
        deadline(BOOT_TIMEOUT_MS, 'AUTH_BOOT_TIMEOUT')
      ]);
    } catch (err) {
      if (err && err.message === 'AUTH_BOOT_TIMEOUT') {
        setAuthReason('BOOT_TIMEOUT');
      } else {
        setAuthReason('ERROR');
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [runWarmupThenResolve]);

  const clearAuthReason = useCallback(() => setAuthReason(null), []);

  const value = {
    user,
    loading,
    authReason,
    /**
     * Best-effort hint: did localStorage contain a Supabase session at mount?
     * Used by route guards to pick loader copy. NOT authorization.
     */
    hasPersistedSession,
    clearAuthReason,
    loginWithGoogle,
    logout,
    isSupabaseConfigured,
    /** Imperative re-fetch of /me only — used after profile-mutating actions. */
    refreshProfile: resolveProfile,
    /** Re-run the full boot pipeline (warmup + /me). Used by recovery loader. */
    retryBoot
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
