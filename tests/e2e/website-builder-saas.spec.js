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

async function devLogin(page, profile, redirect) {
  await page.goto(
    `/api/auth/dev-login?profile=${encodeURIComponent(profile)}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: "commit" },
  );
}

test.describe("Website Builder SaaS verification", () => {
  test.setTimeout(90_000);

  test("public /sites/{slug} is reachable without session when published", async ({
    page,
    playwright,
  }) => {
    await devLogin(page, "admin", "/website");
    await page.waitForURL(/\/website/, { timeout: 45_000 });
    await ensureLegalAccepted(page.request);

    const apiRes = await page.request.get("/api/website-builder");
    expect(apiRes.ok()).toBeTruthy();
    const json = await apiRes.json();
    const slug = String(json?.data?.slug || "").trim();
    expect(slug.length).toBeGreaterThan(1);
    expect(String(json?.data?.websitePath || "")).toMatch(/^\/sites\//);

    const uniqueHeadline = `SaaS verify ${Date.now()}`;
    const saveRes = await page.request.post("/api/website-builder", {
      headers: { "Content-Type": "application/json" },
      data: {
        headline: uniqueHeadline,
        published: true,
      },
    });
    expect(saveRes.ok()).toBeTruthy();

    const publicContext = await playwright.request.newContext();
    const publicRes = await publicContext.get(`/sites/${slug}`);
    expect(publicRes.status()).toBe(200);
    const html = await publicRes.text();
    expect(html).toContain(uniqueHeadline);

    const legacyRes = await publicContext.get(`/site/${slug}`, {
      maxRedirects: 0,
    });
    expect([301, 302, 308]).toContain(legacyRes.status());
    await publicContext.dispose();
  });

  test("unpublished draft returns 404 on public URL", async ({ page, playwright }) => {
    await devLogin(page, "admin", "/website");
    await page.waitForURL(/\/website/, { timeout: 45_000 });
    await ensureLegalAccepted(page.request);

    const apiRes = await page.request.get("/api/website-builder");
    const slug = (await apiRes.json())?.data?.slug;
    expect(slug).toBeTruthy();

    const saveRes = await page.request.post("/api/website-builder", {
      headers: { "Content-Type": "application/json" },
      data: { published: false },
    });
    expect(saveRes.ok()).toBeTruthy();

    const publicContext = await playwright.request.newContext();
    const publicRes = await publicContext.get(`/sites/${slug}`);
    expect(publicRes.status()).toBe(404);
    await publicContext.dispose();
  });

  test("industry preset apply persists headline", async ({ page }) => {
    await devLogin(page, "admin", "/website");
    await page.waitForURL(/\/website/, { timeout: 45_000 });
    await ensureLegalAccepted(page.request);

    const presetRes = await page.request.post("/api/website-builder", {
      headers: { "Content-Type": "application/json" },
      data: {
        industryKeyOverride: "cleaning",
      },
    });
    expect(presetRes.ok()).toBeTruthy();

    const pack = await page.request.get("/api/website-builder");
    const industry = (await pack.json())?.data?.industry;
    expect(industry).toBe("cleaning");

    const applyRes = await page.request.post("/api/website-builder", {
      headers: { "Content-Type": "application/json" },
      data: {
        headline: "Spotless spaces. Zero stress.",
        subheadline: "Residential and commercial cleaning",
        aboutText: "We deliver detailed cleaning",
        ctaText: "Book a Cleaning",
        themeColor: "#0ea5e9",
        services: [
          {
            name: "Recurring Home Cleaning",
            description: "Weekly maintenance",
            price: "From $129",
          },
        ],
        trustBadges: ["Licensed & Insured"],
        testimonials: [
          {
            quote: "Our home has never looked this clean.",
            name: "Sarah M.",
            role: "Homeowner",
          },
        ],
      },
    });
    expect(applyRes.ok()).toBeTruthy();

    const reload = await page.request.get("/api/website-builder");
    const headline = (await reload.json())?.data?.headline;
    expect(headline).toContain("Spotless");
  });

  test("slug update rejects reserved words and accepts valid slug", async ({ page }) => {
    await devLogin(page, "admin", "/website");
    await page.waitForURL(/\/website/, { timeout: 45_000 });
    await ensureLegalAccepted(page.request);

    const bad = await page.request.post("/api/website-builder", {
      headers: { "Content-Type": "application/json" },
      data: { slug: "admin" },
    });
    expect(bad.status()).toBe(400);

    const stamp = `verify-${Date.now()}`.slice(-12);
    const ok = await page.request.post("/api/website-builder", {
      headers: { "Content-Type": "application/json" },
      data: { slug: stamp },
    });
    expect(ok.ok()).toBeTruthy();
    const body = await ok.json();
    expect(body?.data?.slug).toBe(stamp);
    expect(body?.data?.websitePath).toBe(`/sites/${stamp}`);
  });

  test("platform owner resolves to owner command center", async ({ page }) => {
    await devLogin(page, "super_admin", "/dashboard");
    await page.waitForURL(/\/owner\/overview/, { timeout: 45_000 });
    await expect(page).not.toHaveURL(/\/dashboard/);
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).not.toMatch(/contractor dashboard/i);
  });
});
