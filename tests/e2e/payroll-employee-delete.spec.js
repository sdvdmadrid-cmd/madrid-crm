const { test, expect } = require("@playwright/test");
const { devLogin } = require("./helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

async function devLoginAs(page, profile, redirect = "/payroll/employees") {
  await page.goto(
    `/api/auth/dev-login?profile=${encodeURIComponent(profile)}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: "commit" },
  );
  await page.waitForURL(/\/payroll\/employees/, { timeout: 45_000 });
}

async function createEmployee(api, stamp) {
  const res = await api.post(`${ORIGIN}/api/payroll/employees`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      firstName: "Delete",
      lastName: `Test ${stamp}`,
      email: `delete.payroll+${stamp}@example.com`,
      workState: "TX",
      taxForm: "w2",
      payType: "hourly",
      hourlyRate: 20,
      filingStatus: "single",
      status: "active",
    },
  });
  expect(res.ok()).toBeTruthy();
  const payload = await res.json();
  expect(payload.success).toBeTruthy();
  return payload.data;
}

test.describe("Payroll employee deletion", () => {
  test.setTimeout(90_000);

  test("admin can permanently delete employee via UI", async ({ page }) => {
    await devLoginAs(page, "admin");
    await expect(page.getByTestId("payroll-employees-page")).toBeVisible({
      timeout: 15_000,
    });

    const stamp = Date.now();
    const employee = await createEmployee(page.request, stamp);
    const fullName = employee.fullName || `Delete Test ${stamp}`;

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(fullName)).toBeVisible({ timeout: 15_000 });

    await page.getByTestId(`payroll-delete-employee-${employee.id}`).click();
    await expect(page.getByTestId("payroll-delete-employee-modal")).toBeVisible();
    await page.getByTestId("payroll-delete-employee-confirm").click();

    await expect(page.getByText("Employee deleted permanently.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(fullName)).toHaveCount(0, { timeout: 15_000 });

    const getRes = await page.request.get(
      `${ORIGIN}/api/payroll/employees/${employee.id}`,
    );
    expect(getRes.status()).toBe(404);
  });

  test("contractor cannot delete employees via API", async ({ page }) => {
    await devLoginAs(page, "contractor");
    const stamp = Date.now();
    const employee = await createEmployee(page.request, stamp);

    const deleteRes = await page.request.delete(
      `${ORIGIN}/api/payroll/employees/${employee.id}`,
      { headers: ORIGIN_HEADERS },
    );
    expect(deleteRes.status()).toBe(403);

    await devLoginAs(page, "admin");
    const cleanup = await page.request.delete(
      `${ORIGIN}/api/payroll/employees/${employee.id}`,
      { headers: ORIGIN_HEADERS },
    );
    expect(cleanup.ok()).toBeTruthy();
  });
});
