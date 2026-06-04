/**
 * Public contractor website — no-login access (Task 6).
 * Run: npx playwright test tests/e2e/audit/public-website-module.spec.js
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

async function ensureLegalAccepted(api) {
  const statusRes = await api.get(`${ORIGIN}/api/legal/status`, {
    headers: ORIGIN_HEADERS,
  });
  const statusJson = await statusRes.json().catch(() => null);
  if (statusRes.ok() && statusJson?.data?.accepted) return;

  const versionRes = await api.get(`${ORIGIN}/api/legal/version`, {
    headers: ORIGIN_HEADERS,
  });
  const versionJson = await versionRes.json().catch(() => null);
  const version = String(versionJson?.data?.version || "").trim();
  const acceptRes = await api.post(`${ORIGIN}/api/legal/accept`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: version ? { version } : {},
  });
  expect(acceptRes.ok()).toBeTruthy();
}

test.describe("Public website module audit", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  test("incognito: published site page and lead API are public (no 401)", async ({
    page,
    playwright,
  }) => {
    await devLogin(page, { profile: "admin", redirect: "/website" });
    await ensureLegalAccepted(page.request);

    const apiRes = await page.request.get(`${ORIGIN}/api/website-builder`, {
      headers: ORIGIN_HEADERS,
    });
    expect(apiRes.ok()).toBeTruthy();
    const slug = String((await apiRes.json())?.data?.slug || "").trim();
    expect(slug.length).toBeGreaterThan(1);

    const headline = `Public audit ${Date.now()}`;
    const saveRes = await page.request.post(`${ORIGIN}/api/website-builder`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { headline, published: true },
    });
    expect(saveRes.ok()).toBeTruthy();

    const publicContext = await playwright.request.newContext({
      baseURL: ORIGIN,
    });

    const pageRes = await publicContext.get(`/sites/${slug}`);
    expect(pageRes.status()).toBe(200);
    expect(await pageRes.text()).toContain(headline);

    const legacyRes = await publicContext.get(`/site/${slug}`, {
      maxRedirects: 0,
    });
    expect([301, 302, 308]).toContain(legacyRes.status());

    const leadConfigRes = await publicContext.get(
      `/api/site/${encodeURIComponent(slug)}/lead-form-config`,
    );
    expect(leadConfigRes.status()).toBe(200);
    const leadJson = await leadConfigRes.json();
    expect(leadJson.success).toBe(true);
    expect(leadJson.data?.slug).toBe(slug);

    await publicContext.dispose();
  });

  test("sidebar Website opens live /sites/{slug} in a new tab when published", async ({
    page,
  }) => {
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    await ensureLegalAccepted(page.request);

    const apiRes = await page.request.get(`${ORIGIN}/api/website-builder`, {
      headers: ORIGIN_HEADERS,
    });
    const slug = String((await apiRes.json())?.data?.slug || "").trim();
    expect(slug.length).toBeGreaterThan(1);

    const saveRes = await page.request.post(`${ORIGIN}/api/website-builder`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { published: true },
    });
    expect(saveRes.ok()).toBeTruthy();

    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/website-builder/publish-status") && res.ok(),
        { timeout: 20_000 },
      ),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);

    const websiteNav = page.getByTestId("sidebar-live-website");
    await expect(websiteNav).toBeVisible({ timeout: 20_000 });
    await expect(websiteNav).toHaveAttribute("href", `/sites/${slug}`);
    await expect(websiteNav).toHaveAttribute("target", "_blank");
  });
});
