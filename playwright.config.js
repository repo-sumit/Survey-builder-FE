// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright E2E config for Survey Builder Frontend.
 *
 * The specs in `e2e/` exercise the real browser against either:
 *   - a local dev server started by Playwright (default), or
 *   - a deployment URL passed via PLAYWRIGHT_BASE_URL.
 *
 * The specs intercept network calls so they can drive auth state without
 * requiring real Supabase or backend connectivity.
 *
 * Run:
 *   npm run e2e            # starts the dev server, runs all specs headed
 *   npm run e2e -- --ui    # interactive UI mode
 *   PLAYWRIGHT_BASE_URL=https://survey-builder-fe.vercel.app npm run e2e
 */
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { BROWSER: 'none' }
  }
});
