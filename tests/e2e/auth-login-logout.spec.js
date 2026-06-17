/**
 * Login / logout stability — regression for post-logout login redirect loop.
 */
import { test, expect } from "@playwright/test";

const ORIGIN = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

async function devLogin(page, profile = "admin", redirect = "/dashboard") {
  await page.goto(
    `${ORIGIN}/api/auth/dev-login?profile=${encodeURIComponent(profile)}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: "commit" },
  );
}

test.describe("auth login/logout flow", () => {
  test.setTimeout(90_000);

  test.skip(
    process.env.DEV_LOGIN_ENABLED !== "true",
    "Requires DEV_LOGIN_ENABLED=true",
  );

  test("logout then login page stays visible until credentials submitted", async ({
    page,
  }) => {
    await devLogin(page, "admin", "/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });

    const logoutRes = await page.request.post(`${ORIGIN}/api/auth/logout`);
    expect(logoutRes.ok()).toBeTruthy();

    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    const emailField = page.locator("#login-email");
    await expect(emailField).toBeVisible({ timeout: 20_000 });

    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
    await expect(emailField).toBeVisible();
  });

  test("full logout via API and re-login reaches dashboard", async ({ page }) => {
    await devLogin(page, "admin", "/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });

    await page.request.post(`${ORIGIN}/api/auth/logout`);

    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 20_000 });

    await devLogin(page, "admin", "/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
  });

  test("platform owner logout reaches login without staying on owner overview", async ({
    page,
  }) => {
    await devLogin(page, "super_admin", "/owner/overview");
    await expect(page).toHaveURL(/\/owner\/overview/, { timeout: 45_000 });

    await page.getByRole("banner").getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 20_000 });

    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/login activity unavailable/i)).toHaveCount(0);
    await expect(page.getByText(/ai monitoring/i)).toHaveCount(0);
  });

  test("contractor logout from dashboard reaches login without permission errors", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await devLogin(page, "admin", "/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });

    const logoutBtn = page.getByTestId("sidebar-logout-btn");
    await logoutBtn.evaluate((el) => el.click());
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 20_000 });

    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/unauthenticated/i)).toHaveCount(0);
    await expect(page.getByText(/403/i)).toHaveCount(0);
  });
});
