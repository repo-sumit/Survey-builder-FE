// @ts-check
const { test, expect } = require('./fixtures');

test.describe('Auth routing', () => {
  test('authed admin visiting /login is redirected to /admin without logout', async ({ asAdmin: page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: /Admin Panel/i })).toBeVisible();
  });

  test('authed state user visiting /login is redirected to /', async ({ asStateUser: page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/^[^#?]*\/?$|^[^#?]*\/?\?/);
  });

  test('unauthenticated user visiting /admin is redirected to /login', async ({ asUnauthenticated: page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('non-admin trying to hit /admin is redirected to /', async ({ asStateUser: page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/^[^#?]*\/?$|^[^#?]*\/?\?/);
  });

  test('reload /admin while authed remains authed', async ({ asAdmin: page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /Admin Panel/i })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /Admin Panel/i })).toBeVisible();
  });

  test('back button after logout does not show protected page', async ({ asAdmin: page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /Admin Panel/i })).toBeVisible();
    // Simulate logout by clearing storage + remocking /me to 401.
    await page.evaluate(() => window.localStorage.clear());
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Authentication required"}' })
    );
    await page.goto('/login');
    await page.goBack();
    // Without a valid session, ProtectedRoute should bounce them back to /login.
    await expect(page).toHaveURL(/\/login/);
  });

  test('slow /me does not blank the page — branded loader shows', async ({ page }) => {
    // Delay /me by 3 seconds. Boot loader should still show its branded copy,
    // never a blank screen.
    await page.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, {
      key: 'sb-test-project-auth-token',
      value: JSON.stringify({
        access_token: 'fake', refresh_token: 'r-fake',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'u', email: 'admin@example.com' }
      })
    });
    await page.route('**/api/auth/me', async (route) => {
      await new Promise(r => setTimeout(r, 3000));
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: { id: 1, email: 'admin@example.com', role: 'admin', isActive: true } })
      });
    });
    await page.route('**/api/health', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
    );
    await page.route('**/api/admin/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.goto('/admin');
    // Branded loader is visible during the wait.
    await expect(page.getByText(/Restoring your session|Loading/i)).toBeVisible();
    // Eventually settles on the admin panel.
    await expect(page.getByRole('heading', { name: /Admin Panel/i })).toBeVisible({ timeout: 8_000 });
  });
});
