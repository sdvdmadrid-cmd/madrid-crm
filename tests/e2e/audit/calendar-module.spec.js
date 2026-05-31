/**
 * Calendar module — contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/calendar-module.spec.js
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Calendar module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/calendar" });
    await expect(page.getByTestId("calendar-shell")).toBeVisible({ timeout: 20_000 });
  });

  test("layout — today strip, forecast, grid day cells", async ({ page }) => {
    await expect(page.getByTestId("calendar-today-strip")).toBeVisible();
    await expect(page.getByTestId("calendar-forecast-strip")).toBeVisible();
    await expect(page.locator('[data-testid^="calendar-day-"]').first()).toBeVisible();
  });

  test("add appointment from today strip", async ({ page }) => {
    await page.getByRole("button", { name: /Add appointment/i }).click();
    await expect(page.getByTestId("appointment-title-input")).toBeVisible();
  });

  test("GET appointments API returns list", async ({ page }) => {
    const res = await page.request.get(`${ORIGIN}/api/appointments`, {
      headers: ORIGIN_HEADERS,
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json) || Array.isArray(json?.data)).toBeTruthy();
  });
});
