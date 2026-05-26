import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authAPI } from '../services/api';
import { supabase, isSupabaseConfigured, signOutSupabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

/**
 * Hard ceiling on how long the auth bootstrap may block app rendering.
 * After this elapses we settle to a known unauthenticated state and let
 * ProtectedRoute redirect to /login. This prevents indefinite blank Loading
 * screens caused by a hung /api/auth/me, slow Supabase JWKS, or a Render
 * cold start.
 */
const BOOT_TIMEOUT_MS = 8000;

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
  const supabaseSessionRef = useRef(null);
  const resolvingRef = useRef(false);     // guard against duplicate /me calls
  const bootedRef = useRef(false);        // ensure boot only runs once

  /**
   * Ask the backend "who am I?". Single source of truth for role + state.
   * On success → set user.
   * On 403 → record the reason banner and clear auth.
   * On any other failure (incl. timeout, network) → clear auth quietly.
   * Always returns; never throws.
   */
  const resolveProfile = useCallback(async () => {
    if (resolvingRef.current) return null;
    resolvingRef.current = true;
    try {
      const profile = await Promise.race([
        authAPI.me(),
        deadline(BOOT_TIMEOUT_MS, 'ME_TIMEOUT')
      ]);
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
