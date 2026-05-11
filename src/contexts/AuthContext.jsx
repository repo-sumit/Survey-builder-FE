import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);          // Local profile from /api/auth/me
  const [authError, setAuthError] = useState(null); // e.g. "not invited", "inactive"
  const [loading, setLoading] = useState(true);
  const profileLoadKey = useRef(null);              // de-duplicate concurrent fetches

  const loadProfile = useCallback(async (accessToken) => {
    if (!accessToken) {
      setUser(null);
      setAuthError(null);
      return;
    }
    // De-dupe: only one /me request in flight at a time per token.
    if (profileLoadKey.current === accessToken) return;
    profileLoadKey.current = accessToken;
    try {
      const profile = await authAPI.me();
      setUser(profile);
      setAuthError(null);
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || err?.response?.data?.message || err.message;
      setUser(null);
      if (status === 403) {
        setAuthError(message || 'Your Google account is not invited. Contact admin.');
      } else if (status === 401) {
        setAuthError(null); // 401 will already trigger sign-out via the interceptor
      } else {
        setAuthError(message || 'Failed to load profile');
      }
    } finally {
      profileLoadKey.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setAuthError('Supabase is not configured. See SUPABASE_SETUP.md.');
      return undefined;
    }

    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      setSession(data?.session || null);
      if (data?.session?.access_token) {
        await loadProfile(data.session.access_token);
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession || null);
      if (event === 'SIGNED_OUT' || !nextSession) {
        setUser(null);
        setAuthError(null);
        queryClient.clear();
        return;
      }
      await loadProfile(nextSession.access_token);
    });

    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [loadProfile, queryClient]);

  const loginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setUser(null);
      setAuthError(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = {
    user,
    session,
    token: session?.access_token || null,
    loading,
    authError,
    isSupabaseConfigured,
    loginWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
