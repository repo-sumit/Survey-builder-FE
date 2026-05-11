import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't throw — the app must still render the login screen with a useful
  // error rather than crash on import. AuthContext will surface this.
  console.error(
    '[supabaseClient] REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set. ' +
    'See SUPABASE_SETUP.md.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://invalid.local',
  supabaseAnonKey || 'invalid-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}
