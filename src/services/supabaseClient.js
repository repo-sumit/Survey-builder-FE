import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export async function getAccessToken() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

export async function signOutSupabase() {
  if (!supabase) return;
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
}

/**
 * Synchronous best-effort check for a persisted Supabase session.
 *
 * Supabase v2 stores the access/refresh token under a `sb-<project-ref>-auth-token`
 * key in localStorage when `persistSession: true`. This lookup lets the auth
 * bootstrap render a "Restoring your session…" loader on hard refresh / URL-edit
 * navigations instead of momentarily rendering the login form for an
 * already-authenticated user (the perceived-logout flash).
 *
 * This is a UX hint only — it is NEVER trusted for authorization. The backend
 * still verifies the signed JWT on every protected request.
 */
export function hasPersistedSupabaseSession() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw && raw.length > 2) return true;
      }
    }
  } catch {
    /* localStorage blocked (private mode, cookies disabled) — treat as no hint */
  }
  return false;
}

export async function signInWithGoogle(redirectTo) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
  }
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo || `${window.location.origin}/`
    }
  });
}
