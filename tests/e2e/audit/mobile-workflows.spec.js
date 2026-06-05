// @ts-check
import { test, expect } from "@playwright/test";

const MOBILE = { width: 390, height: 844 };

test.describe("Mobile workflow shells @audit", () => {
  test.use({ viewport: MOBILE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL || "owner@madrid.test");
    await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD || "test-password-1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/(dashboard|jobs|clients)/, { timeout: 30_000 });
  });

  test("dashboard loads on iPhone viewport", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  });

  test("jobs list loads on mobile", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.locator("[data-testid='jobs-page'], main")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("calendar grid visible on mobile", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.locator("[data-testid^='calendar-day-']").first()).toBeVisible({
      timeout: 25_000,
    });
  });
});
