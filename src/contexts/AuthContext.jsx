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

/* LEGACY LOGIN — disabled. Kept commented for reference.
function decodeLegacyJwt(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
end LEGACY LOGIN */

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  // LEGACY LOGIN — legacy JWT state removed.
  // const [legacyToken, setLegacyToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [authReason, setAuthReason] = useState(null); // NOT_INVITED | INACTIVE | DOMAIN_BLOCKED
  const supabaseSessionRef = useRef(null);

  /** Resolve the current identity by calling /api/auth/me.
   *  Only Supabase access tokens are honored.
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
      // LEGACY LOGIN — localStorage cleanup no longer needed.
      // localStorage.removeItem('token');
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

      // 2. If we have a Supabase session, ask /me.
      const haveSupabaseSession = !!supabaseSessionRef.current;
      /* LEGACY LOGIN — local-storage token boot disabled.
      const haveLegacy = !!legacyToken && !!decodeLegacyJwt(legacyToken);
      if (haveSupabaseSession || haveLegacy) { ... }
      end LEGACY LOGIN */
      if (haveSupabaseSession) {
        await resolveProfile();
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
          setUser(null);
        }
      });
      sub = data?.subscription;
    }

    return () => {
      cancelled = true;
      if (sub) sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* LEGACY LOGIN — username/password login disabled. Kept for reference.
  const loginLegacy = useCallback(async (username, password) => {
    const data = await authAPI.login(username, password);
    localStorage.setItem('token', data.token);
    setLegacyToken(data.token);
    const profile = await resolveProfile();
    return profile || data.user;
  }, [resolveProfile]);
  end LEGACY LOGIN */

  const loginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Google sign-in is not configured.');
    }
    // Returns immediately; the actual session arrives via onAuthStateChange after redirect.
    await authAPI.loginWithGoogle();
  }, []);

  const logout = useCallback(async () => {
    // LEGACY LOGIN — localStorage cleanup no longer needed.
    // localStorage.removeItem('token');
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
    // LEGACY LOGIN — loginLegacy removed.
    // loginLegacy,
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
