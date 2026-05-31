/**
 * Website Builder module — contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/website-builder-module.spec.js
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

test.describe("Website Builder module audit", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/website" });
    await page.waitForURL(/\/website/, { timeout: 45_000 });
    await expect(page.getByTestId("website-builder-shell")).toBeVisible({
      timeout: 20_000,
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`layout: ${viewport.name} — builder shell loads`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(
        page.getByRole("heading", { name: /^Website Builder$/i }),
      ).toBeVisible();
      await expect(page.getByTestId("website-builder-shell")).toBeVisible();
    });
  }

  test("GET /api/website-builder returns slug and path", async ({ page }) => {
    const res = await page.request.get(`${ORIGIN}/api/website-builder`, {
      headers: ORIGIN_HEADERS,
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(String(json?.data?.slug || "").length).toBeGreaterThan(1);
    expect(String(json?.data?.websitePath || "")).toMatch(/^\/sites\//);
  });

  test("publish surfaces live site link and Lead Inbox CTA", async ({
    page,
    playwright,
  }) => {
    const apiRes = await page.request.get(`${ORIGIN}/api/website-builder`, {
      headers: ORIGIN_HEADERS,
    });
    expect(apiRes.ok()).toBeTruthy();
    const slug = String((await apiRes.json())?.data?.slug || "").trim();
    expect(slug.length).toBeGreaterThan(1);

    const headline = `WB Audit ${Date.now()}`;
    const saveRes = await page.request.post(`${ORIGIN}/api/website-builder`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { headline, published: true },
    });
    expect(saveRes.ok()).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("website-view-live")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("website-view-leads")).toBeVisible();

    const publicContext = await playwright.request.newContext();
    const publicRes = await publicContext.get(`/sites/${slug}`);
    expect(publicRes.status()).toBe(200);
    expect(await publicRes.text()).toContain(headline);
    await publicContext.dispose();
  });
});
