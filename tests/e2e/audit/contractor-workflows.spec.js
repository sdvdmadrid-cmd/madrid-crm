/**
 * End-to-end contractor workflows — stabilization validation.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Contractor workflows", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test("reports hub links resolve", async ({ page }) => {
    await page.goto(`${ORIGIN}/reports`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("reports-hub")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("reports-business-pl")).toBeVisible();
    await page.getByTestId("reports-business-pl").click();
    await expect(page).toHaveURL(/\/dashboard\/financial/);
  });

  test("workflow: job + expense + financial P&L", async ({ page }) => {
    const stamp = Date.now();
    const api = page.request;

    const jobRes = await api.post(`${ORIGIN}/api/jobs`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        title: `Workflow ${stamp}`,
        clientName: "Workflow Client",
        service: "Landscape",
        status: "In Progress",
        price: "5000",
      },
    });
    expect(jobRes.ok()).toBeTruthy();
    const jobPayload = await jobRes.json();
    const jobId = jobPayload.data?._id || jobPayload.data?.id;

    const expenseRes = await api.post(`${ORIGIN}/api/jobs/${jobId}/expenses`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { category: "vendor", vendorName: "Supplier", amount: 200, description: "Mulch" },
    });
    expect(expenseRes.ok()).toBeTruthy();

    await page.goto(`${ORIGIN}/jobs/${jobId}/financial`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("job-financial-dashboard")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Cost breakdown/i)).toBeVisible();
  });

  test("AI high-impact tool requires confirmation", async ({ page }) => {
    const res = await page.request.post(`${ORIGIN}/api/workspace-agent`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        message: "Create a final invoice for job Workflow Test for $1000",
        pathname: "/jobs",
        agentMode: true,
        history: [],
      },
    });
    expect(res.ok()).toBeTruthy();
    const payload = await res.json();
    const data = payload.data || payload;
    const needsConfirm =
      data.requiresConfirmation === true ||
      String(data.answer || "").toLowerCase().includes("confirm");
    expect(needsConfirm).toBeTruthy();
  });
});
