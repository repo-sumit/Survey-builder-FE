import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authAPI } from '../services/api';
import { supabase, isSupabaseConfigured, signOutSupabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function decodeLegacyJwt(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [legacyToken, setLegacyToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [authReason, setAuthReason] = useState(null); // NOT_INVITED | INACTIVE | DOMAIN_BLOCKED
  const supabaseSessionRef = useRef(null);

  /** Resolve the current identity by calling /api/auth/me.
   *  Works for both Supabase access tokens and the legacy JWT.
   *  On 403 we surface the reason for the Login page banner.
   */
  const resolveProfile = useCallback(async () => {
    try {
      const profile = await authAPI.me();
      setUser(profile);
      setAuthReason(null);
      return profile;
    } catch (err) {
      const code = err?.response?.data?.error;
      if (err?.response?.status === 403 && code) {
        setAuthReason(code);
      }
      // Hard-clear both auth sources; the response interceptor handles 401 redirects.
      localStorage.removeItem('token');
      setLegacyToken(null);
      await signOutSupabase();
      setUser(null);
      return null;
    }
  }, []);

  // Boot + subscribe to Supabase auth changes.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // 1. Hydrate Supabase session (if configured) — supabase reads localStorage itself.
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        supabaseSessionRef.current = data?.session || null;
      }

      // 2. If we have either a Supabase session OR a non-expired legacy token, ask /me.
      const haveSupabaseSession = !!supabaseSessionRef.current;
      const haveLegacy = !!legacyToken && !!decodeLegacyJwt(legacyToken);
      if (haveSupabaseSession || haveLegacy) {
        await resolveProfile();
      } else if (legacyToken) {
        // Legacy token present but expired/broken — clean it up.
        localStorage.removeItem('token');
        setLegacyToken(null);
      }
      if (!cancelled) setLoading(false);
    }

    boot();

    // Subscribe to Supabase auth changes (sign-in/sign-out/refresh).
    let sub;
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        supabaseSessionRef.current = session;
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await resolveProfile();
        } else if (event === 'SIGNED_OUT') {
          if (!legacyToken) setUser(null);
        }
      });
      sub = data?.subscription;
    }

    return () => {
      cancelled = true;
      if (sub) sub.unsubscribe();
    };
    // legacyToken intentionally omitted — boot runs once; legacy login path drives setUser directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginLegacy = useCallback(async (username, password) => {
    const data = await authAPI.login(username, password);
    localStorage.setItem('token', data.token);
    setLegacyToken(data.token);
    // The /me endpoint gives us the unified shape (incl. label).
    const profile = await resolveProfile();
    return profile || data.user;
  }, [resolveProfile]);

  const loginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Google sign-in is not configured.');
    }
    // Returns immediately; the actual session arrives via onAuthStateChange after redirect.
    await authAPI.loginWithGoogle();
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem('token');
    setLegacyToken(null);
    await signOutSupabase();
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
    loginLegacy,
    loginWithGoogle,
    logout,
    isSupabaseConfigured
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
