const { test, expect } = require('@playwright/test');

async function ensureLegalAccepted(request) {
  const originHeaders = { Origin: 'http://localhost:3000' };

  const statusRes = await request.get('/api/legal/status', { headers: originHeaders });
  const statusJson = await statusRes.json().catch(() => null);
  if (statusRes.ok() && statusJson?.data?.accepted) {
    return;
  }

  const versionRes = await request.get('/api/legal/version', { headers: originHeaders });
  const versionJson = await versionRes.json().catch(() => null);
  const version = String(versionJson?.data?.version || '').trim();

  const acceptRes = await request.post('/api/legal/accept', {
    headers: {
      ...originHeaders,
      'Content-Type': 'application/json',
    },
    data: version ? { version } : {},
  });
  expect(acceptRes.ok()).toBeTruthy();
}

test.describe('bill payments processing center', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/auth/dev-login?profile=admin&redirect=%2Fbill-payments%2Fprocessing-center', {
      waitUntil: 'domcontentloaded',
    });
    await ensureLegalAccepted(page.request);
  });

  test('loads processing center and responds to filter controls', async ({ page }) => {
    await page.goto('/bill-payments/processing-center', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Credit Card Processing Center')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh data' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Export CSV' })).toBeVisible();

    await page.selectOption('select:has(option[value="monthly"])', 'monthly');
    await page.selectOption('select:has(option[value="acceptedPayments"])', 'acceptedPayments');
    await page.getByRole('button', { name: /\+ Card brand/i }).click();

    const brandsSelect = page.locator('select:has(option[value="all"])').nth(1);
    await expect(brandsSelect).toBeVisible();

    await page.getByRole('button', { name: 'Refresh data' }).click();
    await expect(page.getByText('Trend')).toBeVisible();
  });

  test('analytics endpoint returns tenant data with active filters', async ({ page }) => {
    const response = await page.request.get('/api/bill-payments/analytics?interval=weekly&deduplicated=true&paymentMethodType=all&status=all&includeConnectedAccounts=true');
    expect(response.ok()).toBeTruthy();

    const json = await response.json();
    expect(json?.success).toBeTruthy();
    expect(json?.data).toBeTruthy();
    expect(Array.isArray(json?.data?.buckets)).toBeTruthy();
    expect(Array.isArray(json?.data?.recentTransactions)).toBeTruthy();
    expect(json?.data?.summary).toBeTruthy();
  });

  test('persists filters in URL for sharable state', async ({ page }) => {
    await page.goto('/bill-payments/processing-center?interval=monthly&status=all', { waitUntil: 'domcontentloaded' });

    await expect
      .poll(() => page.url())
      .toContain('interval=monthly');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => page.url())
      .toContain('interval=monthly');
    await expect
      .poll(() => page.url())
      .toContain('status=all');
  });
});
