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
 *   - First `/me` attempt races against ME_TIMEOUT_FIRST_MS.
 *   - On timeout we DO NOT purge — we retry once with ME_TIMEOUT_SECOND_MS,
 *     since the most common cause is a cold backend (10–15s wake-up).
 *   - Total worst-case bootstrap is bounded by BOOT_TIMEOUT_MS.
 *
 * These values are intentionally a bit higher than the previous single 8s
 * cap. The branded loader surfaces a "still working" message after 4s and a
 * "reload" affordance after 12s, so a longer cap doesn't feel worse — it just
 * avoids spurious BOOT_TIMEOUT/logout when the backend simply needs to wake.
 */
const ME_TIMEOUT_FIRST_MS = 6000;
const ME_TIMEOUT_SECOND_MS = 12000;
const BOOT_TIMEOUT_MS = 20000;

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

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReason, setAuthReason] = useState(null); // NOT_INVITED | INACTIVE | DOMAIN_BLOCKED | BOOT_TIMEOUT
  // Synchronous best-effort hint computed once at mount — used by route guards
  // to choose loader copy ("Restoring your session…" vs plain "Loading…"). NEVER
  // used as proof of identity; the backend is still the authority on every API.
  const [hasPersistedSession] = useState(() => hasPersistedSupabaseSession());
  const supabaseSessionRef = useRef(null);
  const resolvingRef = useRef(false);     // guard against duplicate /me calls
  const bootedRef = useRef(false);        // ensure boot only runs once

  /**
   * Ask the backend "who am I?". Single source of truth for role + state.
   * On success → set user.
   * On 403 with a reason code → record the banner reason and clear auth.
   * On a first-attempt network timeout → retry once with a longer deadline
   *   (handles Render cold-start where a single /me can take 10–15s). We do
   *   NOT purge after the first timeout because purging would needlessly log
   *   the user out for a transient backend warm-up.
   * On any other failure (401, expired token, 5xx, second timeout) → clear
   *   auth quietly.
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
      const code = err?.response?.data?.error;
      if (err?.response?.status === 403 && code) {
        setAuthReason(code);
      } else if (err?.message === 'ME_TIMEOUT') {
        setAuthReason('BOOT_TIMEOUT');
      }
      await purgeBrowserAuthArtifacts();
      setUser(null);
      return null;
    } finally {
      resolvingRef.current = false;
    }
  }, []);

  // Boot once + subscribe to Supabase auth events.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    let cancelled = false;

    async function bootInner() {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        supabaseSessionRef.current = data?.session || null;
      }
      if (supabaseSessionRef.current) {
        await resolveProfile();
      }
    }

    async function boot() {
      try {
        await Promise.race([bootInner(), deadline(BOOT_TIMEOUT_MS, 'AUTH_BOOT_TIMEOUT')]);
      } catch (err) {
        if (err.message === 'AUTH_BOOT_TIMEOUT') {
          console.error('[auth] boot timeout — falling back to unauthenticated');
          setAuthReason('BOOT_TIMEOUT');
        }
        await purgeBrowserAuthArtifacts();
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();

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
      cancelled = true;
      if (sub) sub.unsubscribe();
    };
    // resolveProfile is stable (useCallback w/ empty deps). Run once.
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
    /** Imperative re-fetch — useful for tests and after profile-mutating actions. */
    refreshProfile: resolveProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
