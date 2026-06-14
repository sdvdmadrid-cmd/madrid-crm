const { test, expect } = require("@playwright/test");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

async function devLoginAs(page, profile, redirect = "/dashboard") {
  await page.goto(
    `/api/auth/dev-login?profile=${encodeURIComponent(profile)}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: "commit" },
  );
}

test.describe("Subscription enforcement", () => {
  test.setTimeout(90_000);

  test("expired trial user is redirected from dashboard to subscribe page", async ({
    page,
  }) => {
    await devLoginAs(page, "expired_trial", "/dashboard");
    await expect(page).toHaveURL(/\/subscribe/, { timeout: 45_000 });
    await expect(page.getByTestId("subscribe-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Trial Expired" })).toBeVisible();
  });

  test("expired trial user cannot access protected pages", async ({ page }) => {
    await devLoginAs(page, "expired_trial", "/subscribe");
    await expect(page).toHaveURL(/\/subscribe/, { timeout: 45_000 });

    await page.goto("/clients", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/subscribe/, { timeout: 45_000 });

    await page.goto("/settings", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/subscribe/, { timeout: 45_000 });
  });

  test("expired trial user cannot access business APIs", async ({ page }) => {
    await devLoginAs(page, "expired_trial", "/subscribe");
    await expect(page).toHaveURL(/\/subscribe/, { timeout: 45_000 });

    const clientsRes = await page.request.get(`${ORIGIN}/api/clients`, {
      headers: ORIGIN_HEADERS,
    });
    expect(clientsRes.status()).toBe(403);
    const payload = await clientsRes.json();
    expect(payload.code).toBe("SUBSCRIPTION_REQUIRED");

    const currentRes = await page.request.get(`${ORIGIN}/api/subscriptions/current`, {
      headers: ORIGIN_HEADERS,
    });
    expect(currentRes.ok()).toBeTruthy();
  });

  test("subscribe now starts Stripe checkout flow", async ({ page }) => {
    await devLoginAs(page, "expired_trial", "/subscribe");
    await expect(page.getByTestId("subscribe-now-btn")).toBeVisible({
      timeout: 15_000,
    });

    const checkoutRes = await page.request.post(`${ORIGIN}/api/subscriptions/checkout`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { source: "expired_trial" },
    });

    if (checkoutRes.ok()) {
      const payload = await checkoutRes.json();
      expect(payload.success).toBeTruthy();
      expect(String(payload.url || "")).toMatch(/^https:\/\/checkout\.stripe\.com/);
    } else {
      const payload = await checkoutRes.json();
      expect([503, 500]).toContain(checkoutRes.status());
      expect(payload.error).toBeTruthy();
    }
  });

  test("logout works from subscribe page", async ({ page }) => {
    await devLoginAs(page, "expired_trial", "/subscribe");
    await expect(page.getByTestId("subscribe-logout-btn")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("subscribe-logout-btn").click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });
  });

  test("admin dev profile retains business access", async ({ page }) => {
    await devLoginAs(page, "admin", "/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });

    const clientsRes = await page.request.get(`${ORIGIN}/api/clients`, {
      headers: ORIGIN_HEADERS,
    });
    expect(clientsRes.ok()).toBeTruthy();
  });
});
