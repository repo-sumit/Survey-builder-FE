/* eslint-env jest */
/**
 * Tests for the public-path skip list used by the Axios request interceptor.
 *
 * Why this is unit-scoped (not full Axios integration):
 *   CRA's Jest setup does not transform `node_modules/axios` (v1.x ships as
 *   ESM), so importing it from a test triggers "Cannot use import statement
 *   outside a module". Pulling the interceptor body into a small pure helper
 *   tested independently is both simpler and faster than maintaining a
 *   Babel transformIgnorePatterns override just for one test.
 *
 * What this locks in:
 *   - The skip-list matches /api/health, /api/ready, /api/keep-alive.
 *   - The match is suffix-based so it works for both relative and absolute
 *     URLs.
 *   - Query strings are ignored.
 *   - Anything else (notably /api/auth/me) is NOT considered public.
 */
const { isPublicApiPath, PUBLIC_API_PATHS } = require('../publicApiPaths');

describe('PUBLIC_API_PATHS contract', () => {
  test('explicitly lists the three public endpoints', () => {
    expect(PUBLIC_API_PATHS).toEqual(['/api/health', '/api/ready', '/api/keep-alive']);
  });
});

describe('isPublicApiPath', () => {
  test('returns true for exact relative public paths', () => {
    expect(isPublicApiPath('/api/health')).toBe(true);
    expect(isPublicApiPath('/api/ready')).toBe(true);
    expect(isPublicApiPath('/api/keep-alive')).toBe(true);
  });

  test('returns false for protected endpoints', () => {
    expect(isPublicApiPath('/api/auth/me')).toBe(false);
    expect(isPublicApiPath('/api/surveys')).toBe(false);
    expect(isPublicApiPath('/api/admin/users')).toBe(false);
    expect(isPublicApiPath('/api/translate')).toBe(false);
  });

  test('ignores query strings', () => {
    expect(isPublicApiPath('/api/health?ts=123')).toBe(true);
    expect(isPublicApiPath('/api/ready?cache=no')).toBe(true);
  });

  test('matches absolute URLs (defensive — axios may pass absolute URLs)', () => {
    expect(isPublicApiPath('https://api.example.com/api/health')).toBe(true);
    expect(isPublicApiPath('http://localhost:5001/api/ready')).toBe(true);
    expect(isPublicApiPath('https://api.example.com/api/auth/me')).toBe(false);
  });

  test('handles undefined, null, and non-string gracefully', () => {
    expect(isPublicApiPath(undefined)).toBe(false);
    expect(isPublicApiPath(null)).toBe(false);
    expect(isPublicApiPath('')).toBe(false);
    expect(isPublicApiPath(42)).toBe(false);
  });

  test('does not match similar-but-distinct paths', () => {
    // Suffix match could theoretically over-match. These should NOT match.
    expect(isPublicApiPath('/api/health-check')).toBe(false);
    expect(isPublicApiPath('/api/readymade')).toBe(false);
  });
});
