const { test, expect } = require('@playwright/test');
const { devLogin } = require('./helpers/auth');

test.describe('bill payments', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: 'admin', redirect: '/bill-payments' });
    await page.goto('/bill-payments', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: /Bills & Payments/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('wallet section links to payment method management', async ({ page }) => {
    await expect(page.getByText(/^Wallet$/)).toBeVisible({ timeout: 15_000 });
    const manageWallet = page.getByRole('link', { name: /Manage cards & banks/i });
    await expect(manageWallet).toBeVisible();
    await manageWallet.click();
    await expect(page).toHaveURL(/tab=wallet/, { timeout: 15_000 });
  });

  test('opens add bill drawer and accepts provider input', async ({ page }) => {
    await page.getByRole('button', { name: /\+ Add Bill/i }).click();
    await expect(page).toHaveURL(/\/bill-payments\/new/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Bills & Payments/i })).toBeVisible();

    const providerInput = page.getByPlaceholder('Provider / Payee');
    await expect(providerInput).toBeVisible({ timeout: 15_000 });
    await providerInput.fill('AT');
    await expect(providerInput).toHaveValue('AT');
  });

  test('shows inline validation for required bill fields', async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole('button', { name: /\+ Add Bill/i }).click();
    await expect(page).toHaveURL(/\/bill-payments\/new/, { timeout: 15_000 });
    await expect(page.getByPlaceholder('Provider / Payee')).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /^Add bill$/i }).click();

    await expect(page.getByText('Provider is required')).toBeVisible();
    await expect(page.getByText('Account label is required')).toBeVisible();
  });

  test('shows fee-inclusive bulk payment summary', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Pay Selected/i })).toContainText(/fee/i);
  });
});
