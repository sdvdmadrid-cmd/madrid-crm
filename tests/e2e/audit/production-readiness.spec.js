/**
 * Production readiness — core modules load without error banners.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";

const MODULE_PAGES = [
  { path: "/dashboard", testId: "dashboard-shell", name: "Dashboard" },
  { path: "/clients", name: "Clients" },
  { path: "/estimates", name: "Estimates" },
  { path: "/jobs", name: "Jobs" },
  { path: "/calendar", name: "Calendar" },
  { path: "/invoices", name: "Invoices" },
  { path: "/payroll", testId: "payroll-overview", name: "Payroll" },
  { path: "/reports", testId: "reports-hub", name: "Reports" },
  { path: "/dashboard/financial", testId: "executive-financial-dashboard", name: "Business P&L" },
  { path: "/equipment", testId: "equipment-page", name: "Equipment" },
];

test.describe("Production readiness — module shells", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  for (const mod of MODULE_PAGES) {
    test(`${mod.name} page loads`, async ({ page }) => {
      await page.goto(`${ORIGIN}${mod.path}`, { waitUntil: "domcontentloaded" });
      if (mod.testId) {
        await expect(page.getByTestId(mod.testId)).toBeVisible({ timeout: 30000 });
      } else {
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30000 });
      }
      const metricsError = page.getByTestId("dashboard-metrics-error");
      if (await metricsError.count()) {
        await expect(metricsError).not.toBeVisible();
      }
    });
  }
});
