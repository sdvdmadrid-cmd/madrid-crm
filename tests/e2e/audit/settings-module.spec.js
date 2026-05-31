/**
 * Settings hub — contractor usability audit.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

test.describe("Settings module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/settings" });
    await expect(page.getByTestId("settings-hub")).toBeVisible({ timeout: 20_000 });
  });

  test("hub cards — payments, subscription, catalog, website", async ({ page }) => {
    await expect(page.getByTestId("settings-hub-payments")).toBeVisible();
    await expect(page.getByTestId("settings-hub-subscription")).toBeVisible();
    await expect(page.getByTestId("settings-hub-catalog")).toBeVisible();
    await expect(page.getByTestId("settings-hub-website")).toBeVisible();
  });

  test("payments settings page loads", async ({ page }) => {
    await page.getByTestId("settings-hub-payments").click();
    await expect(page).toHaveURL(/\/settings\/payments/);
    await expect(page.getByRole("link", { name: /All settings/i })).toBeVisible();
  });
});
