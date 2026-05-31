/**
 * Service Catalog module — contractor usability audit.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Service Catalog module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/services-catalog" });
    await expect(
      page.getByRole("heading", { name: /^Service Catalog$/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("layout — form, search, website link", async ({ page }) => {
    await expect(page.getByTestId("services-catalog-form")).toBeVisible();
    const search = page.getByLabel(/Search services/i);
    await expect(search).toBeVisible();
    await search.fill("zzzz-no-match-zzzz");
    await expect(page.getByText(/No matches|No services yet/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Website builder/i })).toBeVisible();
  });

  test("GET services-catalog API", async ({ page }) => {
    const res = await page.request.get(`${ORIGIN}/api/services-catalog`, {
      headers: ORIGIN_HEADERS,
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.data).toBeDefined();
  });
});
