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

  test("expired trial user is redirected from dashboard to subscriptions", async ({
    page,
  }) => {
    await devLoginAs(page, "expired_trial", "/dashboard");
    await expect(page).toHaveURL(/\/subscriptions/, { timeout: 45_000 });
    await expect(page.url()).toContain("trial_expired=1");
    await expect(page.getByTestId("subscriptions-page")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("expired trial user cannot access business APIs", async ({ page }) => {
    await devLoginAs(page, "expired_trial", "/subscriptions");
    await expect(page).toHaveURL(/\/subscriptions/, { timeout: 45_000 });

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

  test("subscribe now links to subscriptions checkout flow", async ({ page }) => {
    await devLoginAs(page, "expired_trial", "/subscriptions");
    await expect(page.getByTestId("subscriptions-page")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/subscriptions?subscribe=1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("subscriptions-start-checkout")).toBeVisible();

    const checkoutRes = await page.request.post(`${ORIGIN}/api/subscriptions/checkout`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { source: "app" },
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

  test("admin dev profile retains business access", async ({ page }) => {
    await devLoginAs(page, "admin", "/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });

    const clientsRes = await page.request.get(`${ORIGIN}/api/clients`, {
      headers: ORIGIN_HEADERS,
    });
    expect(clientsRes.ok()).toBeTruthy();
  });
});
