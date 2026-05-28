import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authAPI } from '../services/api';
import {
  supabase,
  isSupabaseConfigured,
  signOutSupabase,
  hasPersistedSupabaseSession
} from '../services/supabaseClient';
import {
  readValidCache,
  writeCache,
  clearCache as clearLastVerifiedCache
} from '../services/lastVerifiedUserCache';

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
 * "Recoverable" reasons (BOOT_TIMEOUT, ERROR) are shown via full-screen
 * recovery only when there's no cached identity. When a valid cached user
 * is present, the same transient failure surfaces as a non-blocking
 * `authWarning` banner instead.
 */
export const AUTH_RECOVERABLE_REASONS = ['BOOT_TIMEOUT', 'ERROR'];

/**
 * authWarning — non-blocking status for stale-while-revalidate.
 * Only ever set when there IS a cached user; otherwise we use authReason +
 * full-screen recovery instead.
 *
 *   - 'RECONNECTING' : background /me failed transiently (timeout / 5xx /
 *                       network). The cached user keeps using the app
 *                       (read-only-safe paths); a small banner offers Retry.
 */
export const AUTH_WARNINGS = { RECONNECTING: 'RECONNECTING' };

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
 *   - the lastVerifiedUser cache (must die with the session)
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
  // The lastVerifiedUser cache is auth-bound; clear it too so the next
  // boot can't show a previous identity's role to whoever logs in next.
  clearLastVerifiedCache();
}

/**
 * Classify a resolveProfile error so the boot pipeline can make exactly
 * one decision per failure mode. The classification determines two things:
 *   - `purge`: whether to wipe Supabase storage + sign out.
 *   - `reason`: which authReason to surface (null = no banner / generic).
 *
 * The cardinal rule: a transient backend hiccup (timeout, 5xx, network
 * blip) must NEVER purge — only authoritative server signals (401 = bad/
 * expired token, 403 with a canonical code = user-level rejection) cause
 * a purge.
 *
 * `transient: true` is the signal the caller needs to decide between
 * full-screen recovery (no cached user) and inline banner (cached user
 * present). The `reason` is still set so the recovery loader has the
 * right copy, but the SWR path will choose to use `authWarning` instead.
 */
function classifyMeError(err) {
  if (err && err.message === 'ME_TIMEOUT') {
    return { purge: false, reason: 'BOOT_TIMEOUT', transient: true };
  }
  const status = err?.response?.status;
  const code = err?.response?.data?.error;
  if (status === 401) {
    return { purge: true, reason: null, transient: false };
  }
  if (status === 403 && code) {
    return { purge: true, reason: code, transient: false };
  }
  if (status === 403) {
    return { purge: true, reason: null, transient: false };
  }
  // 5xx, network errors, opaque CORS failures, axios timeouts that didn't
  // come from our own ME_TIMEOUT deadline — KEEP session, recoverable.
  return { purge: false, reason: 'ERROR', transient: true };
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReason, setAuthReason] = useState(null);
  /**
   * authWarning — non-blocking banner state. Only set when we have a
   * cached user and the background /me failed transiently. Never blocks
   * route rendering.
   */
  const [authWarning, setAuthWarning] = useState(null);
  const [isRevalidating, setIsRevalidating] = useState(false);
  // Synchronous best-effort hint computed once at mount — used by route guards
  // to choose loader copy ("Restoring your session…" vs plain "Loading…"). NEVER
  // used as proof of identity; the backend is still the authority on every API.
  const [hasPersistedSession] = useState(() => hasPersistedSupabaseSession());
  const supabaseSessionRef = useRef(null);
  const resolvingRef = useRef(false);     // guard against duplicate /me calls
  const bootedRef = useRef(false);        // ensure boot only runs once
  // Synchronous mirror of the user state. CRITICAL: we set this in
  // setUserSync BEFORE the React state update flushes, so the background
  // revalidation's error path (which runs in the same microtask chain as
  // the SWR cache render) sees the correct identity. If we relied on a
  // `userRef.current = user` line during render, it would be stale because
  // React doesn't render between scheduling setUser and the next async
  // continuation in the same call stack.
  const userRef = useRef(null);
  const setUserSync = useCallback((next) => {
    userRef.current = next;
    setUser(next);
  }, []);

  /**
   * Ask the backend "who am I?". Single source of truth for role + state.
   *
   * Modes:
   *   - background=false (default): foreground boot or explicit retry.
   *     On any failure, clear user and surface a reason / recovery state.
   *   - background=true: stale-while-revalidate revalidation. A cached
   *     user is already in `user` state and on screen. Transient failures
   *     (BOOT_TIMEOUT / ERROR) MUST NOT clear the user — they only set
   *     a non-blocking authWarning. Authoritative failures (401, 403)
   *     still purge.
   *
   * Always returns; never throws.
   */
  const resolveProfile = useCallback(async ({ background = false } = {}) => {
    if (resolvingRef.current) return null;
    resolvingRef.current = true;
    if (background) setIsRevalidating(true);
    try {
      let profile;
      try {
        profile = await Promise.race([
          authAPI.me(),
          deadline(ME_TIMEOUT_FIRST_MS, 'ME_TIMEOUT')
        ]);
      } catch (firstErr) {
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
      setUserSync(profile);
      setAuthReason(null);
      setAuthWarning(null);
      // Persist for the next boot. Only AFTER /me succeeds — never before.
      writeCache(profile, supabaseSessionRef.current);
      return profile;
    } catch (err) {
      const { purge, reason, transient } = classifyMeError(err);
      if (purge) {
        // Authoritative rejection (401 / 403). Tear everything down,
        // including the cache, so the next boot can't fall back to it.
        await purgeBrowserAuthArtifacts();
        setUserSync(null);
        setAuthReason(reason);
        setAuthWarning(null);
      } else if (transient && background && userRef.current) {
        // Stale-while-revalidate happy path: we have a cached user on
        // screen and the background revalidator hit a transient failure.
        // KEEP the user. KEEP the cache (the user is still valid as far
        // as the last successful /me told us). Surface a non-blocking
        // banner so the user knows mutations may not land yet.
        setAuthWarning(AUTH_WARNINGS.RECONNECTING);
      } else {
        // No cached user OR foreground call — fall back to the existing
        // full-screen recovery contract. Session is preserved (no purge).
        setUserSync(null);
        setAuthReason(reason);
        setAuthWarning(null);
      }
      return null;
    } finally {
      resolvingRef.current = false;
      if (background) setIsRevalidating(false);
    }
  }, [setUserSync]);

  /**
   * Run the warmup probe (bounded by WARMUP_TIMEOUT_MS) and then /me.
   * Returns when the boot pipeline has settled — never throws.
   */
  const runWarmupThenResolve = useCallback(async ({ background = false } = {}) => {
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
    await resolveProfile({ background });
  }, [resolveProfile]);

  /**
   * Boot — three branches:
   *   1. No Supabase session → settle unauthenticated immediately.
   *   2. Session + valid cached user → render cache, revalidate in background.
   *   3. Session + no/expired/mismatched cache → strict foreground boot.
   */
  useEffect(() => {
    if (!bootedRef.current) {
      bootedRef.current = true;

      const bootInner = async () => {
        // Step 1: hydrate Supabase session.
        if (isSupabaseConfigured && supabase) {
          const { data } = await supabase.auth.getSession();
          supabaseSessionRef.current = data?.session || null;
        }

        // Branch 1: no session — nothing to verify.
        if (!supabaseSessionRef.current) {
          // Defensive: if a previous tab left a cache here without a
          // session (shouldn't happen, but cheap to handle), evict it.
          clearLastVerifiedCache();
          return;
        }

        // Branch 2: cached identity matches the session — render the
        // app immediately and revalidate in the background. The
        // background path tolerates timeouts/5xx without dropping
        // the user, but still respects 401/403 from the backend.
        const cached = readValidCache(supabaseSessionRef.current);
        if (cached && cached.user) {
          setUserSync(cached.user);
          // The async revalidation runs OUTSIDE the BOOT_TIMEOUT race —
          // it's no longer gating the loader. Fire-and-forget; any
          // failure is captured by resolveProfile's own catch and
          // surfaced as authWarning instead of an unhandled rejection.
          runWarmupThenResolve({ background: true }).catch(() => {});
          return;
        }

        // Branch 3: session but no valid cache — strict foreground
        // boot. Existing behavior: full-screen recovery on
        // BOOT_TIMEOUT/ERROR, /access-denied on 403, /login on 401.
        await runWarmupThenResolve({ background: false });
      };

      (async () => {
        try {
          await Promise.race([bootInner(), deadline(BOOT_TIMEOUT_MS, 'AUTH_BOOT_TIMEOUT')]);
        } catch (err) {
          // The outer BOOT_TIMEOUT only fires if bootInner itself stalls
          // (e.g. supabase.auth.getSession hung). Treat as recoverable —
          // BUT honor the cached-user contract: if we already showed a
          // cached user (Branch 2), do NOT drop them.
          if (err && err.message === 'AUTH_BOOT_TIMEOUT') {
            // eslint-disable-next-line no-console
            console.warn('[auth] boot timeout — recoverable, session preserved');
            if (userRef.current) {
              setAuthWarning(AUTH_WARNINGS.RECONNECTING);
            } else {
              setAuthReason('BOOT_TIMEOUT');
              setUserSync(null);
            }
          } else {
            // eslint-disable-next-line no-console
            console.error('[auth] boot threw — recoverable, session preserved', err);
            if (userRef.current) {
              setAuthWarning(AUTH_WARNINGS.RECONNECTING);
            } else {
              setAuthReason('ERROR');
              setUserSync(null);
            }
          }
        } finally {
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
          clearLastVerifiedCache();
          setUserSync(null);
        }
      });
      sub = data?.subscription;
    }

    return () => {
      if (sub) sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Google sign-in is not configured.');
    }
    await authAPI.loginWithGoogle();
  }, []);

  /**
   * Logout — must clear ALL auth artifacts atomically, including the
   * lastVerifiedUser cache.
   */
  const logout = useCallback(async () => {
    await purgeBrowserAuthArtifacts();
    setUserSync(null);
    setAuthReason(null);
    setAuthWarning(null);
    queryClient.clear();
  }, [queryClient, setUserSync]);

  /**
   * Re-run the boot pipeline. Called from the recovery loader's Retry
   * button AND from the reconnect banner's Retry action.
   *
   * When called with a cached user already on screen, this re-runs in
   * background mode (so a second transient failure stays a banner, not
   * a full-screen takeover).
   */
  const retryBoot = useCallback(async () => {
    const hadUser = !!userRef.current;
    if (!hadUser) {
      // Foreground retry from the recovery loader.
      setLoading(true);
      setAuthReason(null);
    }
    setAuthWarning(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        supabaseSessionRef.current = data?.session || null;
      }
      if (!supabaseSessionRef.current) {
        // Session vanished between mount and retry.
        clearLastVerifiedCache();
        setUserSync(null);
        return;
      }
      await Promise.race([
        runWarmupThenResolve({ background: hadUser }),
        deadline(BOOT_TIMEOUT_MS, 'AUTH_BOOT_TIMEOUT')
      ]);
    } catch (err) {
      if (hadUser) {
        // We had a cached user on screen — don't kick them out for a
        // retry-time hiccup, just re-arm the warning.
        setAuthWarning(AUTH_WARNINGS.RECONNECTING);
      } else if (err && err.message === 'AUTH_BOOT_TIMEOUT') {
        setAuthReason('BOOT_TIMEOUT');
        setUserSync(null);
      } else {
        setAuthReason('ERROR');
        setUserSync(null);
      }
    } finally {
      if (!hadUser) setLoading(false);
    }
  }, [runWarmupThenResolve, setUserSync]);

  const clearAuthReason = useCallback(() => setAuthReason(null), []);
  const dismissAuthWarning = useCallback(() => setAuthWarning(null), []);

  const value = {
    user,
    loading,
    authReason,
    authWarning,
    isRevalidating,
    hasPersistedSession,
    clearAuthReason,
    dismissAuthWarning,
    loginWithGoogle,
    logout,
    isSupabaseConfigured,
    /** Imperative re-fetch of /me only — used after profile-mutating actions. */
    refreshProfile: resolveProfile,
    /** Re-run the full boot pipeline (warmup + /me). Used by recovery loader + banner. */
    retryBoot
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
