const { test, expect } = require('@playwright/test');

test.describe('bill payments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/auth/dev-login?profile=admin&redirect=%2Fbill-payments', {
      waitUntil: 'domcontentloaded',
    });
    await page.goto('/bill-payments', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: /Bills & Payments/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('opens payment-method setup from choose payment method when no method is selected', async ({ page }) => {
    await page.getByRole('button', { name: /Choose payment method/i }).click();

    await expect(
      page.getByRole('button', { name: /Save card or debit|Add card\/debit/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('opens add bill drawer and accepts provider input', async ({ page }) => {
    await page.getByRole('button', { name: /Add Bill/i }).click();

    const providerInput = page.getByPlaceholder('Provider / Payee');
    await expect(providerInput).toBeVisible();
    await providerInput.fill('AT');
    await expect(providerInput).toHaveValue('AT');
  });

  test('shows inline validation for required bill fields', async ({ page }) => {
    await page.getByRole('button', { name: /Add Bill/i }).click();
    await page.getByRole('button', { name: /^Add bill$/i }).last().click();

    await expect(page.getByText('Account label is required')).toBeVisible();
    await expect(page.getByText('Amount due is required')).toBeVisible();
    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible();
  });

  test('shows fee-inclusive bulk payment summary', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Pay Selected/i })).toContainText(/fee/i);
  });
});
