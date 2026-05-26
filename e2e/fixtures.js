// @ts-check
/**
 * Test fixtures that wire up a fake authentication context without needing
 * a real Supabase / Google OAuth flow. The trick is two-fold:
 *   1. Pre-seed a `sb-…-auth-token` value in localStorage so the
 *      `hasPersistedSupabaseSession()` hint returns true on first paint.
 *   2. Intercept /api/auth/me with a canned response so AuthContext settles
 *      into the desired role.
 */
const { test: base, expect } = require('@playwright/test');

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.payload';
const SB_KEY = 'sb-test-project-auth-token';
const SB_VALUE = JSON.stringify({
  access_token: FAKE_TOKEN,
  refresh_token: 'r-fake',
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  user: { id: 'sb-user-id', email: 'admin@example.com' }
});

const FAKE_ADMIN_PROFILE = {
  id: 1, email: 'admin@example.com', role: 'admin', stateCode: null, isActive: true, name: 'Admin'
};
const FAKE_STATE_PROFILE = {
  id: 2, email: 'state@example.com', role: 'state', stateCode: 'HP', isActive: true, name: 'HP User'
};

async function seedSession(page, profile) {
  // Set localStorage BEFORE the app boots — addInitScript runs on each
  // navigation in the same context.
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: SB_KEY, value: SB_VALUE });

  // Mock /me so AuthContext resolves to the given profile.
  await page.route('**/api/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: profile })
    });
  });
  // Health probe is fire-and-forget — answer fast.
  await page.route('**/api/health', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' });
  });
  // Sensible defaults for admin-panel data so tests don't 500.
  await page.route('**/api/admin/users', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.continue();
  });
  await page.route('**/api/admin/state-config', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { state_code: 'HP', state_name: 'Himachal Pradesh', available_languages: 'English,Hindi' },
          { state_code: 'MH', state_name: 'Maharashtra', available_languages: 'English,Marathi' }
        ])
      });
    }
    return route.continue();
  });
}

const test = base.extend({
  asAdmin: async ({ page }, use) => {
    await seedSession(page, FAKE_ADMIN_PROFILE);
    await use(page);
  },
  asStateUser: async ({ page }, use) => {
    await seedSession(page, FAKE_STATE_PROFILE);
    await use(page);
  },
  asUnauthenticated: async ({ page }, use) => {
    // No localStorage seed; /me returns 401.
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Authentication required"}' })
    );
    await page.route('**/api/health', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
    );
    await use(page);
  }
});

module.exports = { test, expect };
