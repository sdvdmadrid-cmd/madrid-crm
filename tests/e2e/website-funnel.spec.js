const { test, expect } = require("@playwright/test");

async function ensureLegalAccepted(api) {
  const originHeaders = { Origin: "http://localhost:3000" };
  const statusRes = await api.get("/api/legal/status", { headers: originHeaders });
  const statusJson = await statusRes.json().catch(() => null);
  if (statusRes.ok() && statusJson?.data?.accepted) return;

  const versionRes = await api.get("/api/legal/version", { headers: originHeaders });
  const versionJson = await versionRes.json().catch(() => null);
  const version = String(versionJson?.data?.version || "").trim();
  const acceptRes = await api.post("/api/legal/accept", {
    headers: { ...originHeaders, "Content-Type": "application/json" },
    data: version ? { version } : {},
  });
  expect(acceptRes.ok()).toBeTruthy();
}

test("register path redirects to login register mode", async ({ page }) => {
  await page.goto("/register");
  await expect(page).toHaveURL(/\/login\?mode=register/, { timeout: 15_000 });
});

test.describe("Website builder funnel", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto("/api/auth/dev-login?profile=admin&redirect=%2Fwebsite", {
      waitUntil: "commit",
    });
    await page.waitForURL(/\/website/, { timeout: 45_000 });
    await ensureLegalAccepted(page.request);
  });

  test("loads website builder API and public site route", async ({ page }) => {
    const apiRes = await page.request.get("/api/website-builder");
    expect(apiRes.ok()).toBeTruthy();
    const json = await apiRes.json();
    expect(json?.success).toBe(true);
    expect(json?.data?.slug).toBeTruthy();

    const slug = json.data.slug;
    await page.goto("/website");
    await expect(page.locator("body")).toBeVisible();

    const publicRes = await page.request.get(`/sites/${slug}`);
    expect([200, 404]).toContain(publicRes.status());
  });
});
