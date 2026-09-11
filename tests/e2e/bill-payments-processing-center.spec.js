const { test, expect } = require('@playwright/test');

test.describe('legacy bill payments processing center disabled', () => {
  test('redirects processing center to expenses', async ({ page }) => {
    await page.goto('/api/auth/dev-login?profile=admin&redirect=%2Fexpenses', {
      waitUntil: 'domcontentloaded',
    });
    await page.goto('/bill-payments/processing-center', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/\/expenses/, { timeout: 15_000 });
  });

  test('analytics endpoint is disabled', async ({ page }) => {
    await page.goto('/api/auth/dev-login?profile=admin&redirect=%2Fdashboard', {
      waitUntil: 'domcontentloaded',
    });
    const response = await page.request.get(
      '/api/bill-payments/analytics?interval=weekly&deduplicated=true&paymentMethodType=all&status=all&includeConnectedAccounts=true',
    );
    expect(response.status()).toBe(403);
    const json = await response.json();
    expect(json?.code).toBe('BILL_PAY_DISABLED');
  });
});
