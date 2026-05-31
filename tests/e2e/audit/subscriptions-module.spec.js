/**
 * Subscriptions module — contractor usability audit.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Subscriptions module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/subscriptions" });
    await expect(page.getByTestId("subscriptions-page")).toBeVisible({
      timeout: 25_000,
    });
  });

  test("layout — back to settings, plan title", async ({ page }) => {
    await expect(page.getByTestId("subscriptions-back-settings")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /FieldBase subscription/i }),
    ).toBeVisible();
  });

  test("GET subscription APIs", async ({ page }) => {
    for (const path of ["/api/subscriptions/current", "/api/subscriptions/invoices"]) {
      const res = await page.request.get(`${ORIGIN}${path}`, {
        headers: ORIGIN_HEADERS,
      });
      expect(res.ok(), path).toBeTruthy();
    }
  });
});
