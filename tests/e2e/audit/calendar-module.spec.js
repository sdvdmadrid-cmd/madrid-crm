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

  test("rejects junk address without Places selection", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route("**/api/places/autocomplete**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, predictions: [] }),
      });
    });

    await page.getByRole("button", { name: /Add appointment/i }).click();
    const stamp = Date.now();
    await page.getByTestId("appointment-title-input").fill(`Site visit ${stamp}`);
    await page.getByPlaceholder("Client", { exact: true }).fill(`Client ${stamp}`);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    await page.getByTestId("appointment-date-input").fill(dateStr);
    await page.locator('input[type="time"]').fill("10:30");

    const streetInput = page.locator("#appointment-address-street");
    await streetInput.click();
    await streetInput.fill("asdfasdfasdf");
    await page.getByTestId("appointment-save-button").click();

    await expect(
      page.getByText(/does not look like a real address|Select a valid address/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("saves appointment with verified Places address", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route("**/api/places/autocomplete**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          predictions: [
            {
              placeId: "e2e-place-bartlett",
              mainText: "123 Main St",
              description: "123 Main St, Bartlett, IL 60103, USA",
            },
          ],
        }),
      });
    });
    await page.route("**/api/places/details**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          street: "123 Main St",
          city: "Bartlett",
          state: "IL",
          zip: "60103",
          formattedAddress: "123 Main St, Bartlett, IL 60103, USA",
          latitude: 41.995,
          longitude: -88.185,
        }),
      });
    });

    await page.getByRole("button", { name: /Add appointment/i }).click();
    const stamp = Date.now();
    await page.getByTestId("appointment-title-input").fill(`Verified ${stamp}`);
    await page.getByPlaceholder("Client", { exact: true }).fill(`Client ${stamp}`);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    await page.getByTestId("appointment-date-input").fill(tomorrow.toISOString().slice(0, 10));
    await page.locator('input[type="time"]').fill("14:00");

    const street = page.locator("#appointment-address-street");
    await street.click();
    await street.fill("123 Main");
    const suggestion = street.locator("xpath=..").locator("li", { hasText: "123 Main St" });
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await page.getByTestId("appointment-save-button").click();
    await expect(page.getByTestId("appointment-title-input")).not.toBeVisible({
      timeout: 15_000,
    });

    const listRes = await page.request.get(`${ORIGIN}/api/appointments`, {
      headers: ORIGIN_HEADERS,
    });
    expect(listRes.ok()).toBeTruthy();
    const rows = await listRes.json();
    const list = Array.isArray(rows) ? rows : rows?.data || [];
    const saved = list.find((row) => String(row.title || "").includes(`Verified ${stamp}`));
    expect(saved).toBeTruthy();
    expect(String(saved.location || "")).toMatch(/Bartlett/i);
    expect(Number(saved.latitude)).toBeCloseTo(41.995, 0);
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
