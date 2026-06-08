// @ts-check
import { test, expect } from "@playwright/test";
const { devLogin } = require("../helpers/auth");

const MOBILE = { width: 390, height: 844 };

test.describe("Mobile workflow shells @audit", () => {
  test.use({ viewport: MOBILE });

  test.beforeEach(async ({ page }) => {
    await devLogin(page);
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
