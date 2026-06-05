/**
 * Contractor OS — vendors, bills & expenses, job photos, daily reports.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Contractor OS modules", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await devLogin(page, { redirect: "/expenses" });
  });

  test("expenses hub loads with bills and vendor tabs", async ({ page }) => {
    await page.goto("/expenses", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("expenses-hub-page")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Bills & Expenses/i })).toBeVisible();
    await expect(page.getByTestId("expenses-tab-bills")).toBeVisible();
    await expect(page.getByTestId("expenses-tab-vendors")).toBeVisible();
  });

  test("vendor and bill flow links to job costing", async ({ page }) => {
    const stamp = Date.now();
    const api = page.request;

    const jobRes = await api.post(`${ORIGIN}/api/jobs`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        title: `OS Flow ${stamp}`,
        clientName: "Smith Patio",
        service: "Hardscape",
        status: "In Progress",
        price: "12000",
        taxState: "TX",
      },
    });
    expect(jobRes.ok()).toBeTruthy();
    const jobPayload = await jobRes.json();
    const jobId = jobPayload.data?._id || jobPayload.data?.id;
    expect(jobId).toBeTruthy();

    const vendorRes = await api.post(`${ORIGIN}/api/vendors`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        name: `Local Supply ${stamp}`,
        category: "material_store",
        phone: "555-0100",
      },
    });
    const vendorPayload = await vendorRes.json();
    expect(vendorRes.ok(), JSON.stringify(vendorPayload)).toBeTruthy();
    const vendorId = vendorPayload.data?.id;
    expect(vendorId).toBeTruthy();

    const billRes = await api.post(`${ORIGIN}/api/expenses/bills`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        vendorId,
        jobId,
        amountDue: 450,
        dueDate: new Date().toISOString().slice(0, 10),
        category: "materials",
        notes: "CA6 stone delivery",
      },
    });
    const billPayload = await billRes.json();
    expect(billRes.ok(), JSON.stringify(billPayload)).toBeTruthy();

    const plRes = await api.get(`${ORIGIN}/api/jobs/${jobId}/financial`);
    const plPayload = await plRes.json();
    expect(plRes.ok(), JSON.stringify(plPayload)).toBeTruthy();
    expect(Number(plPayload.data?.actual?.billsAssignedTotal || 0)).toBeGreaterThanOrEqual(450);

    await page.goto(`/jobs/${jobId}/photos`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("job-photos-page")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("job-workspace-tab-photos")).toBeVisible();

    const reportRes = await api.post(`${ORIGIN}/api/jobs/${jobId}/daily-reports`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        reportDate: new Date().toISOString().slice(0, 10),
        crew: [{ name: "David", hours: 8 }],
        materials: "CA6 Stone",
        equipment: "Skid Steer",
        weather: "Sunny",
        notes: "Base prep completed",
      },
    });
    const reportPayload = await reportRes.json();
    expect(reportRes.ok(), JSON.stringify(reportPayload)).toBeTruthy();

    await page.goto(`/jobs/${jobId}/daily-reports`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("job-daily-reports-page")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Base prep completed/i)).toBeVisible();
  });

  test("UI can add material store vendor from expenses page", async ({ page }) => {
    const stamp = Date.now();
    await page.goto("/expenses", { waitUntil: "domcontentloaded" });
    await page.getByTestId("expenses-tab-vendors").click();
    await page.getByTestId("vendor-name-input").fill(`Menards ${stamp}`);
    await page.getByTestId("vendor-save-btn").click();
    await expect(page.getByText(/Vendor saved/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(`Menards ${stamp}`)).toBeVisible();
  });
});
