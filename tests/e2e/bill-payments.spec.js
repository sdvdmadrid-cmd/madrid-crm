const { test, expect } = require('@playwright/test');
const { devLogin } = require('./helpers/auth');

test.describe('legacy bill payments disabled', () => {
  test('redirects bill-payments pages to expenses', async ({ page }) => {
    await devLogin(page, { profile: 'admin', redirect: '/expenses' });
    await page.goto('/bill-payments', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/expenses/, { timeout: 15_000 });
  });

  test('rejects bill-payments API with BILL_PAY_DISABLED', async ({ page }) => {
    await devLogin(page, { profile: 'admin', redirect: '/dashboard' });
    const response = await page.request.get('/api/bill-payments');
    expect(response.status()).toBe(403);
    const json = await response.json();
    expect(json?.code).toBe('BILL_PAY_DISABLED');
  });

  test('redirects public bill-payments overview to home', async ({ page }) => {
    await page.goto('/public/bill-payments', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/(?:$|\?)/, { timeout: 15_000 });
  });
});
