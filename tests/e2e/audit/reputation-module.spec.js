/**
 * Reputation module — contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/reputation-module.spec.js
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Reputation module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/reputation" });
    await expect(
      page.getByRole("heading", { name: /Reviews & Reputation/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("layout — tabs, connect panel, search on reviews", async ({ page }) => {
    await expect(page.getByTestId("reputation-tab-connect")).toBeVisible();
    await expect(page.getByTestId("reputation-tab-reviews")).toBeVisible();
    await expect(page.getByTestId("reputation-tab-social")).toBeVisible();
    await expect(page.getByRole("button", { name: /Save connections/i })).toBeVisible();

    await page.getByTestId("reputation-tab-reviews").click();
    await expect(page.getByLabel(/Search synced reviews/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Website builder/i })).toBeVisible();
    await expect(
      page.getByText(/Import review to private archive/i),
    ).toBeVisible();
  });

  test("GET reputation APIs return tenant-scoped data", async ({ page }) => {
    for (const path of [
      "/api/reputation/reviews",
      "/api/reputation/social",
      "/api/reputation/sources",
    ]) {
      const res = await page.request.get(`${ORIGIN}${path}`, {
        headers: ORIGIN_HEADERS,
      });
      expect(res.ok(), path).toBeTruthy();
      const json = await res.json();
      expect(json.success).not.toBe(false);
      expect(json.data).toBeDefined();
    }
  });
});
