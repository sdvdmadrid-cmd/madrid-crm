/**
 * Dashboard module — contractor usability audit.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Dashboard module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    await expect(page.getByTestId("dashboard-shell")).toBeVisible({ timeout: 20_000 });
  });

  test("layout — metrics, pillars, workspace modules", async ({ page }) => {
    await expect(page.getByTestId("dashboard-metric-active-jobs")).toBeVisible();
    await expect(page.getByTestId("dashboard-metric-inbox")).toBeVisible();
    await expect(page.getByRole("link", { name: /Clients/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Lead inbox/i }).first()).toBeVisible();
  });

  test("metric links navigate", async ({ page }) => {
    await page.getByTestId("dashboard-metric-active-jobs").click();
    await expect(page).toHaveURL(/\/jobs/);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.getByTestId("dashboard-metric-inbox").click();
    await expect(page).toHaveURL(/\/lead-inbox/);
  });

  test("GET dashboard-metrics includes leadInbox", async ({ page }) => {
    const res = await page.request.get(`${ORIGIN}/api/dashboard-metrics`, {
      headers: ORIGIN_HEADERS,
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.leadInbox).toBeDefined();
    expect(typeof json.leadInbox.newCount).toBe("number");
  });
});
