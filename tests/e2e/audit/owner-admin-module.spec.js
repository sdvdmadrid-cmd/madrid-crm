/**
 * Owner / Admin module — platform operator audit.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Owner/Admin module audit", () => {
  test("super_admin lands on mission control", async ({ page }) => {
    await devLogin(page, { profile: "super_admin", redirect: "/owner/overview" });
    await expect(page.getByRole("heading", { name: /Mission Control/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: /Payment cards/i }).first()).toBeVisible();
  });

  test("tenant admin redirected away from contractor dashboard", async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    await expect(page.getByTestId("dashboard-shell")).toBeVisible({ timeout: 20_000 });
  });

  test("GET platform overview API (super_admin)", async ({ page }) => {
    await devLogin(page, { profile: "super_admin", redirect: "/owner/overview" });
    const res = await page.request.get(`${ORIGIN}/api/platform/overview`, {
      headers: ORIGIN_HEADERS,
    });
    expect(res.ok()).toBeTruthy();
  });

  test("owner login activity panel and API", async ({ page }) => {
    await devLogin(page, { profile: "super_admin", redirect: "/owner/overview" });
    await expect(page.getByTestId("owner-login-activity")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: /Contractor login activity/i }),
    ).toBeVisible();

    const apiRes = await page.request.get(`${ORIGIN}/api/owner/login-activity`, {
      headers: ORIGIN_HEADERS,
    });
    expect(apiRes.ok()).toBeTruthy();
    const payload = await apiRes.json();
    expect(payload.success).toBeTruthy();
    expect(payload.data?.summary).toBeTruthy();
    expect(Array.isArray(payload.data?.rows)).toBeTruthy();
  });
});
