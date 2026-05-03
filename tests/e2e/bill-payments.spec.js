const { test, expect } = require('@playwright/test');

test.describe('bill payments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/auth/dev-login?profile=admin&redirect=%2Fbill-payments', {
      waitUntil: 'domcontentloaded',
    });
    await page.goto('/bill-payments', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Bill register and bulk pay queue' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('opens Stripe setup from choose payment method when no method is selected', async ({ page }) => {
    await page.getByRole('button', { name: /Choose payment method/i }).click();

    await expect(page.getByRole('button', { name: 'Save card or debit' })).toBeVisible();
    await expect(page.locator('iframe').first()).toBeVisible();
  });

  test('closes provider dropdown after selecting a provider', async ({ page }) => {
    const providerInput = page.getByPlaceholder('Provider / Payee');
    await providerInput.fill('AT');

    const suggestion = page.getByRole('button', { name: /AT&T Business/i });
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    await expect(providerInput).toHaveValue('AT&T Business');
    await expect(page.getByRole('button', { name: /AT&T Business/i })).toHaveCount(0);
  });

  test('shows inline validation for required bill fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Add bill' }).click();

    await expect(page.getByText('Account label is required')).toBeVisible();
    await expect(page.getByText('Amount due is required')).toBeVisible();
    await expect(page.getByText('Due date is required')).toBeVisible();
    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible();
  });

  test('accepts only numeric account numbers up to 25 digits', async ({ page }) => {
    const accountNumberInput = page.getByPlaceholder('Account or member number');
    await accountNumberInput.fill('abc123456789012345678901234567890xyz');

    await expect(accountNumberInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Account number must contain digits only')).toBeVisible();
  });
});
