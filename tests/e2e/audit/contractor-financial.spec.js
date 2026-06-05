/**
 * Contractor OS — job costing, financial dashboard, executive P&L.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Contractor financial OS", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { redirect: "/dashboard/financial" });
  });

  test("executive financial dashboard loads", async ({ page }) => {
    await expect(page.getByTestId("executive-financial-dashboard")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("heading", { name: /Business P&L/i })).toBeVisible();
  });

  test("job expense API updates project P&L", async ({ page }) => {
    const stamp = Date.now();
    const api = page.request;

    const jobRes = await api.post(`${ORIGIN}/api/jobs`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        title: `Cost Test ${stamp}`,
        clientName: "Smith Patio",
        service: "Hardscape",
        status: "In Progress",
        price: "10000",
        taxState: "TX",
      },
    });
    expect(jobRes.ok()).toBeTruthy();
    const jobPayload = await jobRes.json();
    const jobId = jobPayload.data?._id || jobPayload.data?.id || jobPayload._id || jobPayload.id;
    expect(jobId).toBeTruthy();

    const expenseRes = await api.post(`${ORIGIN}/api/jobs/${jobId}/expenses`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        category: "material",
        vendorName: "Home Depot",
        description: "Pavers",
        amount: 500,
      },
    });
    expect(expenseRes.ok()).toBeTruthy();

    const plRes = await api.get(`${ORIGIN}/api/jobs/${jobId}/financial`);
    expect(plRes.ok()).toBeTruthy();
    const pl = await plRes.json();
    expect(pl.success).toBeTruthy();
    expect(pl.data.actual.materialsCost).toBeGreaterThanOrEqual(500);
  });

  test("equipment page loads", async ({ page }) => {
    await page.goto(`${ORIGIN}/equipment`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("equipment-page")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /^Equipment$/i })).toBeVisible();
  });
});
