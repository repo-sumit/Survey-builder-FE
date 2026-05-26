// @ts-check
/**
 * Test fixtures that wire up a fake authentication context without needing
 * a real Supabase / Google OAuth flow. The trick is two-fold:
 *   1. Pre-seed a `sb-<project-ref>-auth-token` value in localStorage so the
 *      `hasPersistedSupabaseSession()` hint returns true on first paint
 *      AND `supabase.auth.getSession()` finds the session under the EXACT
 *      project-ref'd key the configured Supabase v2 client looks for.
 *   2. Intercept /api/auth/me with a canned response so AuthContext settles
 *      into the desired role.
 *
 * Before Phase 9.1 this file hard-coded the localStorage key as
 * `sb-test-project-auth-token`, which broke once REACT_APP_SUPABASE_URL
 * started pointing at a real Supabase project (the client only looks at
 * `sb-<actual-project-ref>-auth-token`). The helpers below derive the
 * project ref from the same sources the build uses, with documented
 * precedence and a safe fallback so the specs survive env drift.
 */
const fs = require('fs');
const path = require('path');
const { test: base, expect } = require('@playwright/test');

/* ── Supabase project-ref discovery ──────────────────────────── */

// Lazy-read .env once per process so we don't hammer the FS for every
// fixture invocation. Returns a plain { KEY: VALUE } map; missing files
// or parse errors return an empty object.
let _envCache;
function readEnvFile() {
  if (_envCache) return _envCache;
  _envCache = {};
  const envPath = path.resolve(__dirname, '..', '.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) return;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      _envCache[k] = v;
    });
  } catch {
    /* missing or unreadable .env — fall through to env vars + default */
  }
  return _envCache;
}

/**
 * Extract the Supabase project ref from a URL like
 *   https://zwfgbiublbemrwxzmgzk.supabase.co  →  "zwfgbiublbemrwxzmgzk"
 * Returns '' for non-supabase URLs so callers can fall back.
 */
function projectRefFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url.trim());
  return m ? m[1] : '';
}

/**
 * Resolve the Supabase project ref to use for fixtures, in order:
 *   1. PLAYWRIGHT_SUPABASE_PROJECT_REF (explicit override for CI / forks)
 *   2. process.env.REACT_APP_SUPABASE_URL (if the runner pre-exported it)
 *   3. REACT_APP_SUPABASE_URL parsed from <root>/.env (what `npm run build`
 *      uses — this is the case in local dev)
 *   4. The literal 'test-project' fallback — only hit when no .env and no
 *      override exist, which means the fake seed will mismatch any
 *      real build but at least keeps the legacy semantics.
 */
function getSupabaseProjectRef() {
  if (process.env.PLAYWRIGHT_SUPABASE_PROJECT_REF) {
    return process.env.PLAYWRIGHT_SUPABASE_PROJECT_REF.trim();
  }
  const envUrlFromProcess = process.env.REACT_APP_SUPABASE_URL;
  const refFromProcess = projectRefFromUrl(envUrlFromProcess);
  if (refFromProcess) return refFromProcess;

  const dotenv = readEnvFile();
  const refFromFile = projectRefFromUrl(dotenv.REACT_APP_SUPABASE_URL);
  if (refFromFile) return refFromFile;

  return 'test-project';
}

/**
 * The localStorage key Supabase v2 stores the persisted session under.
 * Matches the runtime client exactly — verified by the standalone smokes
 * which use the same `sb-<project-ref>-auth-token` pattern.
 */
function getSupabaseStorageKey() {
  return `sb-${getSupabaseProjectRef()}-auth-token`;
}

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.payload';
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
  // The key MUST match the build's configured project ref — otherwise
  // supabase.auth.getSession() returns null and AuthContext bounces to /login.
  const sbKey = getSupabaseStorageKey();

  // Set localStorage BEFORE the app boots — addInitScript runs on each
  // navigation in the same context.
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: sbKey, value: SB_VALUE });

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
  // Short-circuit any background Supabase XHR (token refresh, user fetch,
  // realtime channels) so the auth bootstrap doesn't stall on a real
  // network round-trip during specs. An empty `{}` response is enough
  // for the initial-page case: the v2 client reads the persisted
  // session from localStorage synchronously and AuthContext calls /me
  // with that token. (A more accurate token-refresh mock was tried in
  // Phase 12 to fix the `reload /admin` flake but it actually broke
  // the on-mount cases — see fixmes in auth-routing.spec.js.)
  await page.route('**/*.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
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
    // Same Supabase short-circuit — without this the client occasionally
    // hangs the bootstrap on the first 401 spec.
    await page.route('**/*.supabase.co/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
    await use(page);
  }
});

module.exports = {
  test,
  expect,
  // Re-exported so callers (and a tiny self-check in e2e/fixtures.smoke)
  // can assert the derivation matches the build env.
  getSupabaseProjectRef,
  getSupabaseStorageKey,
};
