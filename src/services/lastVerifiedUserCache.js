/**
 * Last-verified user cache — a stale-while-revalidate cushion for the auth
 * bootstrap.
 *
 * Purpose
 * -------
 * On a free-tier hosting setup (Vercel + Render Free + Supabase), the
 * `/api/auth/me` round-trip can occasionally take 10–30 s when Render
 * cold-starts, or fail outright on a transient 5xx / network blip. Without
 * a cache, AuthContext settles into a full-screen "We couldn't confirm
 * your access" recovery loader for any of those failures, even though the
 * user signed in successfully minutes earlier. That UX is fine for first
 * boot but jarring on refresh / tab-switch / Vercel idle wake.
 *
 * This module persists the LAST successful `/api/auth/me` response so the
 * next boot can render the app shell immediately while a background
 * `/me` revalidation runs. The cache is purely a UX optimisation — every
 * protected API call still hits the backend, which is still the canonical
 * authorization gate. Nothing here is trusted for access decisions.
 *
 * Security rules locked in by the validator:
 *   - Cache is valid ONLY when a Supabase session is also present in
 *     localStorage. No session ⇒ no cache trust.
 *   - Cache identity must match the current Supabase session (by
 *     supabaseUserId or email). A mismatch (e.g. user signed out + back
 *     in as someone else with cache still around) is treated as expired.
 *   - 12-hour TTL — short enough that a long-disabled account doesn't
 *     keep accessing the shell for days.
 *   - No tokens, no secrets, no sensitive PII beyond what /me already
 *     returns (id, role, stateCode, email, name).
 *
 * Callers (AuthContext) MUST:
 *   - writeCache() ONLY after a successful /api/auth/me response.
 *   - clearCache() on logout, 401, 403-with-reason, and on cache mismatch.
 */

export const CACHE_KEY = 'fmb:lastVerifiedUser:v1';
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Best-effort safe-stringify wrapper around localStorage so we never let a
 * QuotaExceededError or private-mode rejection break the auth boot.
 */
function safeGet(key) {
  try {
    return typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* private mode / quota — silently skip, cache is purely best-effort */
  }
}
function safeRemove(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Read + parse the raw cache entry. Returns `null` for anything that
 * doesn't look like the canonical shape. Does NOT enforce TTL or
 * session-match; callers run those checks explicitly (so tests and
 * AuthContext can reason about each rejection class separately).
 */
export function readCacheRaw() {
  const raw = safeGet(CACHE_KEY);
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Garbage in localStorage — most likely a half-written entry from a
    // previous app version. Drop it.
    safeRemove(CACHE_KEY);
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.user || typeof parsed.user !== 'object') return null;
  if (typeof parsed.verifiedAt !== 'number') return null;
  return parsed;
}

/**
 * True iff the cache entry is younger than `CACHE_TTL_MS`. Defensive
 * against clock-skew: a verifiedAt in the future is treated as invalid
 * (signal of tampering or a clock that has since rolled back).
 */
export function isCacheFresh(entry, now = Date.now()) {
  if (!entry || typeof entry.verifiedAt !== 'number') return false;
  if (entry.verifiedAt > now) return false; // future timestamp — drop
  return (now - entry.verifiedAt) < CACHE_TTL_MS;
}

/**
 * True iff the cache entry's identity matches the live Supabase session.
 * We prefer supabaseUserId (stable across email changes); fall back to
 * lowercase email match if the cache predates supabaseUserId.
 *
 * `supabaseSession` is the result of `supabase.auth.getSession()` —
 * specifically the `session` object, NOT the whole `{ data, error }`
 * wrapper.
 */
export function cacheMatchesSession(entry, supabaseSession) {
  if (!entry || !supabaseSession) return false;
  const sessionUser = supabaseSession.user || {};
  const cachedSupabaseId = entry.supabaseUserId;
  const sessionSupabaseId = sessionUser.id;
  if (cachedSupabaseId && sessionSupabaseId) {
    return cachedSupabaseId === sessionSupabaseId;
  }
  // Fall back to email — case-insensitive because Supabase normalises.
  const cachedEmail = (entry.email || '').toLowerCase();
  const sessionEmail = (sessionUser.email || '').toLowerCase();
  if (!cachedEmail || !sessionEmail) return false;
  return cachedEmail === sessionEmail;
}

/**
 * Validate the cache against the current Supabase session and TTL.
 * Returns the parsed cache entry on success, `null` (and removes the
 * cache) on any failure.
 *
 * Use this as the single gate before trusting a cached user for UX.
 */
export function readValidCache(supabaseSession, now = Date.now()) {
  if (!supabaseSession) return null;
  const entry = readCacheRaw();
  if (!entry) return null;
  if (!isCacheFresh(entry, now)) {
    safeRemove(CACHE_KEY);
    return null;
  }
  if (!cacheMatchesSession(entry, supabaseSession)) {
    // Session identity changed — clear so we don't show the previous
    // user's role/state to a different account.
    safeRemove(CACHE_KEY);
    return null;
  }
  return entry;
}

/**
 * Write the user we just got back from /api/auth/me.
 *
 * `supabaseSession` is optional but strongly recommended — without it we
 * can't bind the cache to a supabaseUserId, which means the next boot
 * will have to fall back to email-match. (Callers in AuthContext do
 * pass it.)
 */
export function writeCache(user, supabaseSession, now = Date.now()) {
  if (!user || typeof user !== 'object') return;
  const sessionUser = (supabaseSession && supabaseSession.user) || {};
  const entry = {
    user,
    verifiedAt: now,
    supabaseUserId: sessionUser.id || null,
    email: (user.email || sessionUser.email || '').toLowerCase() || null
  };
  try {
    safeSet(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* ignore — cache is best-effort */
  }
}

/**
 * Remove the cache. Called on logout, on 401, on 403-with-reason, and
 * when AuthContext detects a session/cache identity mismatch.
 */
export function clearCache() {
  safeRemove(CACHE_KEY);
}
