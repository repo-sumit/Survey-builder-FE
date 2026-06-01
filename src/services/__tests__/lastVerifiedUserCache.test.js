/* eslint-env jest */
/**
 * Unit tests for the lastVerifiedUserCache utility.
 *
 * The cache backs the stale-while-revalidate auth boot — every rule here
 * is a security-relevant gate, so each test names the threat model it
 * defends against in its comment.
 */
const {
  CACHE_KEY,
  CACHE_TTL_MS,
  readCacheRaw,
  isCacheFresh,
  cacheMatchesSession,
  readValidCache,
  writeCache,
  clearCache
} = require('../lastVerifiedUserCache');

const ADMIN = { id: 7, email: 'a@b.com', role: 'admin', stateCode: null, isActive: true };
const SESSION = { user: { id: 'sb-uuid-1', email: 'a@b.com' }, access_token: 'tok' };

beforeEach(() => {
  localStorage.clear();
});

describe('writeCache / readCacheRaw round-trip', () => {
  test('persists the canonical shape with timestamp + identity binding', () => {
    writeCache(ADMIN, SESSION, 1_700_000_000_000);
    const entry = readCacheRaw();
    expect(entry).toMatchObject({
      user: ADMIN,
      verifiedAt: 1_700_000_000_000,
      supabaseUserId: 'sb-uuid-1',
      email: 'a@b.com'
    });
  });

  test('binds email lowercase even when user.email casing differs from session.email', () => {
    writeCache({ ...ADMIN, email: 'A@B.com' }, { user: { id: 'sb-x', email: 'A@B.COM' } });
    const entry = readCacheRaw();
    expect(entry.email).toBe('a@b.com');
  });

  test('falsy user input is a no-op — never persists garbage', () => {
    writeCache(null, SESSION);
    writeCache(undefined, SESSION);
    writeCache('not-an-object', SESSION);
    expect(readCacheRaw()).toBeNull();
  });

  test('readCacheRaw returns null for malformed JSON and removes the entry', () => {
    localStorage.setItem(CACHE_KEY, '{not json');
    expect(readCacheRaw()).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  test('readCacheRaw returns null for entries missing required fields', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ user: ADMIN })); // no verifiedAt
    expect(readCacheRaw()).toBeNull();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ verifiedAt: 1, user: null }));
    expect(readCacheRaw()).toBeNull();
  });
});

describe('isCacheFresh — TTL gate', () => {
  test('fresh just-written cache is considered fresh', () => {
    const now = 1_700_000_000_000;
    expect(isCacheFresh({ verifiedAt: now }, now)).toBe(true);
    expect(isCacheFresh({ verifiedAt: now - 1_000 }, now)).toBe(true);
  });

  test('cache older than 12h is stale (defends against long-running tab)', () => {
    const now = 1_700_000_000_000;
    expect(isCacheFresh({ verifiedAt: now - CACHE_TTL_MS - 1 }, now)).toBe(false);
  });

  test('cache at exactly TTL+1ms is stale (boundary guard for the 12h TTL)', () => {
    // Pinning the off-by-one: a verifiedAt that is exactly CACHE_TTL_MS + 1ms
    // in the past must be rejected. Catches regressions that flip `<` to `<=`.
    const now = 1_700_000_000_000;
    expect(isCacheFresh({ verifiedAt: now - (CACHE_TTL_MS + 1) }, now)).toBe(false);
  });

  test('verifiedAt in the future is rejected (defends against clock skew / tampering)', () => {
    const now = 1_700_000_000_000;
    expect(isCacheFresh({ verifiedAt: now + 1_000 }, now)).toBe(false);
  });

  test('missing or non-numeric verifiedAt is rejected', () => {
    expect(isCacheFresh(null)).toBe(false);
    expect(isCacheFresh({})).toBe(false);
    expect(isCacheFresh({ verifiedAt: 'soon' })).toBe(false);
  });
});

describe('cacheMatchesSession — identity gate', () => {
  test('matches when supabaseUserId equals session user id', () => {
    const entry = { supabaseUserId: 'sb-uuid-1', email: 'a@b.com' };
    expect(cacheMatchesSession(entry, SESSION)).toBe(true);
  });

  test('falls back to lowercase email match when supabase id is absent on cache', () => {
    const entry = { supabaseUserId: null, email: 'a@b.com' };
    expect(cacheMatchesSession(entry, { user: { id: 'sb-uuid-1', email: 'A@B.com' } })).toBe(true);
  });

  test('different supabase id is a mismatch — protects against "different user, stale cache"', () => {
    const entry = { supabaseUserId: 'sb-uuid-1', email: 'a@b.com' };
    expect(cacheMatchesSession(entry, { user: { id: 'sb-uuid-2', email: 'a@b.com' } })).toBe(false);
  });

  test('different email (and no supabase id) is a mismatch', () => {
    const entry = { supabaseUserId: null, email: 'a@b.com' };
    expect(cacheMatchesSession(entry, { user: { id: null, email: 'x@y.com' } })).toBe(false);
  });

  test('no session ⇒ no match — cache is meaningless without an active session', () => {
    expect(cacheMatchesSession({ supabaseUserId: 'sb', email: 'a@b.com' }, null)).toBe(false);
  });
});

describe('readValidCache — composite gate (the one AuthContext actually calls)', () => {
  test('returns the entry when fresh + identity-matched + session present', () => {
    writeCache(ADMIN, SESSION, 1_700_000_000_000);
    const got = readValidCache(SESSION, 1_700_000_000_000 + 1_000);
    expect(got && got.user).toEqual(ADMIN);
  });

  test('returns null and EVICTS when expired', () => {
    writeCache(ADMIN, SESSION, 1_700_000_000_000);
    expect(readValidCache(SESSION, 1_700_000_000_000 + CACHE_TTL_MS + 1)).toBeNull();
    // The eviction is part of the security contract — a stale cache
    // must not linger to be picked up on a later boot.
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  test('returns null and EVICTS when session identity changes (re-login as different user)', () => {
    writeCache(ADMIN, SESSION);
    const otherSession = { user: { id: 'sb-uuid-2', email: 'other@x.com' } };
    expect(readValidCache(otherSession)).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  test('returns null when there is no Supabase session at all (does NOT evict)', () => {
    // No session ⇒ don't trust the cache. But we don't evict either —
    // the user may have temporarily lost localStorage access (private
    // tab edge case) and signed back in a moment later.
    writeCache(ADMIN, SESSION);
    expect(readValidCache(null)).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
  });
});

describe('clearCache', () => {
  test('removes the cache key (and is safe to call when absent)', () => {
    writeCache(ADMIN, SESSION);
    clearCache();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    // Idempotent.
    clearCache();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});

describe('security: never stores tokens or secrets', () => {
  test('access_token from the session is NOT persisted into the cache entry', () => {
    writeCache(ADMIN, { user: { id: 'sb', email: 'a@b.com' }, access_token: 'secret-jwt' });
    const raw = localStorage.getItem(CACHE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('secret-jwt');
    expect(raw).not.toContain('access_token');
  });

  test('only the keys we explicitly persist are present (no accidental spread of session)', () => {
    writeCache(ADMIN, SESSION);
    const entry = readCacheRaw();
    expect(Object.keys(entry).sort()).toEqual(
      ['email', 'supabaseUserId', 'user', 'verifiedAt'].sort()
    );
  });
});
