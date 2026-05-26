// @ts-check
const { test, expect } = require('./fixtures');

test.describe('Admin Panel — Add User', () => {
  test('opens form, validates email, submits successfully, refreshes list', async ({ asAdmin: page }) => {
    let getCount = 0;
    await page.route('**/api/admin/users', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        getCount++;
        const body = getCount === 1
          ? '[]'
          : JSON.stringify([
              { id: 9, email: 'butter@example.com', name: 'New User', role: 'state', stateCode: 'HP', isActive: true, authSource: 'google' }
            ]);
        return route.fulfill({ status: 200, contentType: 'application/json', body });
      }
      if (req.method() === 'POST') {
        return route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ id: 9, email: 'butter@example.com', role: 'state', stateCode: 'HP', isActive: true })
        });
      }
      return route.continue();
    });

    await page.goto('/admin?tab=users');
    await expect(page.getByRole('tab', { name: /User Management/i })).toHaveAttribute('aria-selected', 'true');

    // Empty state visible
    await expect(page.getByTestId('users-empty')).toBeVisible();

    await page.getByRole('button', { name: /^Add User$/ }).click();
    // Form is open with email focused
    const emailInput = page.getByLabel(/^Email/);
    await expect(emailInput).toBeVisible();

    // Submit empty → inline validation
    await page.getByTestId('invite-submit').click();
    await expect(page.locator('text=Email is required').first()).toBeVisible();

    // Invalid email format
    await emailInput.fill('not-an-email');
    await page.getByTestId('invite-submit').click();
    await expect(page.locator('text=valid email').first()).toBeVisible();

    // Now a valid submission
    await emailInput.fill('butter@example.com');
    await page.getByLabel(/Name/i).fill('New User');
    await page.getByLabel(/^State/).selectOption('HP');
    await page.getByTestId('invite-submit').click();

    // Form closes
    await expect(page.getByTestId('invite-submit')).toHaveCount(0);
    // List refreshed
    await expect(page.getByTestId('users-table')).toBeVisible();
    await expect(page.locator('text=butter@example.com')).toBeVisible();
  });

  test('shows duplicate email error and keeps form open with inputs preserved', async ({ asAdmin: page }) => {
    await page.route('**/api/admin/users', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (req.method() === 'POST') {
        return route.fulfill({
          status: 409, contentType: 'application/json',
          body: JSON.stringify({ error: 'A user with that email already exists' })
        });
      }
      return route.continue();
    });

    await page.goto('/admin?tab=users');
    await page.getByRole('button', { name: /^Add User$/ }).click();
    await page.getByLabel(/^Email/).fill('dup@example.com');
    await page.getByLabel(/^State/).selectOption('HP');
    await page.getByTestId('invite-submit').click();

    await expect(page.locator('text=already exists').first()).toBeVisible();
    // Form still open
    await expect(page.getByTestId('invite-submit')).toBeVisible();
    // Email preserved
    await expect(page.getByLabel(/^Email/)).toHaveValue('dup@example.com');
  });

  test('submit button disables and shows "Adding…" while in flight', async ({ asAdmin: page }) => {
    await page.route('**/api/admin/users', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (req.method() === 'POST') {
        await new Promise(r => setTimeout(r, 800));
        return route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ id: 11, email: 'slow@example.com', role: 'admin', stateCode: null })
        });
      }
      return route.continue();
    });

    await page.goto('/admin?tab=users');
    await page.getByRole('button', { name: /^Add User$/ }).click();
    await page.getByLabel(/^Email/).fill('slow@example.com');
    await page.getByLabel(/Role/i).selectOption('admin');
    await page.getByTestId('invite-submit').click();

    const submitBtn = page.getByTestId('invite-submit');
    await expect(submitBtn).toBeDisabled();
    await expect(submitBtn).toHaveText(/Adding/i);
  });
});
