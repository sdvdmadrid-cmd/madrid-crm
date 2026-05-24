const { test, expect } = require("@playwright/test");

test.describe("Public lead API", () => {
  test("returns friendly error for unknown slug", async ({ request }) => {
    const slug = `nonexistent-${Date.now()}`;
    const configRes = await request.get(`/api/site/${slug}/lead-form-config`);
    expect(configRes.status()).toBe(404);
    const configJson = await configRes.json();
    expect(configJson.success).toBe(false);
    expect(String(configJson.error || "")).not.toMatch(/website not found/i);
    expect(configJson.code).toBe("not_found");

    const submitRes = await request.post(`/api/site/${slug}/contact`, {
      data: {
        name: "Test User",
        phone: "5551234567",
        serviceNeeded: "General",
        description: "Test lead",
        formStartedAt: Date.now() - 5000,
      },
    });
    expect(submitRes.status()).toBe(404);
    const submitJson = await submitRes.json();
    expect(String(submitJson.error || "")).not.toMatch(/website not found/i);
    expect(submitJson.code).toBe("not_found");
  });

  test("published contractor site accepts lead-form-config when available", async ({
    request,
  }) => {
    const builderRes = await request.get("/api/website-builder");
    if (!builderRes.ok()) {
      test.skip();
      return;
    }
    const builderJson = await builderRes.json();
    const slug = String(builderJson?.data?.slug || "").trim();
    const published = builderJson?.data?.published === true;
    if (!slug || !published) {
      test.skip();
      return;
    }

    const configRes = await request.get(`/api/site/${slug}/lead-form-config`);
    expect(configRes.ok()).toBeTruthy();
    const configJson = await configRes.json();
    expect(configJson.success).toBe(true);
    expect(configJson.data.slug).toBe(slug);
    expect(Array.isArray(configJson.data.services)).toBe(true);
  });
});
