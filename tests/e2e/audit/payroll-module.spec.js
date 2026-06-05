/**
 * Payroll module — Phase 1 contractor audit.
 * Run: npx playwright test tests/e2e/audit/payroll-module.spec.js
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function createPayrollEmployee(api, stamp) {
  const res = await api.post(`${ORIGIN}/api/payroll/employees`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      firstName: "Jorge",
      lastName: `Audit ${stamp}`,
      email: `jorge.payroll+${stamp}@example.com`,
      phone: "+15550009999",
      addressStreet: "100 Payroll Lane",
      addressCity: "Austin",
      addressState: "TX",
      addressZip: "73301",
      workState: "TX",
      taxForm: "w2",
      payType: "hourly",
      hourlyRate: 25,
      filingStatus: "single",
      status: "active",
    },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`create employee failed (${res.status()}): ${body}`);
  }

  const payload = await res.json();
  expect(payload.success).toBeTruthy();
  expect(payload.data?.id).toBeTruthy();
  return payload.data;
}

async function createPayRun(api, stamp) {
  const res = await api.post(`${ORIGIN}/api/payroll/runs`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      title: `Audit run ${stamp}`,
      periodStart: isoDate(-13),
      periodEnd: isoDate(-1),
      payDate: isoDate(0),
      scheduleType: "biweekly",
    },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`create pay run failed (${res.status()}): ${body}`);
  }

  const payload = await res.json();
  expect(payload.success).toBeTruthy();
  expect(payload.data?.id).toBeTruthy();
  return payload.data;
}

test.describe("Payroll module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/payroll" });
    await expect(page.getByRole("heading", { name: /^Payroll$/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("sidebar and sub-navigation", async ({ page }) => {
    await expect(page.getByRole("link", { name: /^Payroll$/i }).first()).toBeVisible();
    const payrollNav = page.getByRole("navigation", { name: /Payroll sections/i });
    await expect(payrollNav.getByRole("link", { name: /^Employees$/i })).toBeVisible();
    await expect(payrollNav.getByRole("link", { name: /^Pay runs$/i })).toBeVisible();

    await payrollNav.getByRole("link", { name: /^Employees$/i }).click();
    await expect(page).toHaveURL(/\/payroll\/employees/);
    await expect(
      page.getByRole("heading", { name: /Payroll employees/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /^Pay runs$/i }).first().click();
    await expect(page).toHaveURL(/\/payroll\/runs/);
    await expect(page.getByRole("heading", { name: /^Pay runs$/i })).toBeVisible();
  });

  test("/employees alias redirects to payroll employees", async ({ page }) => {
    await page.goto("/employees", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/payroll\/employees/);
  });

  test("add employee form shows guided sections and pay preview", async ({ page }) => {
    const payrollNav = page.getByRole("navigation", { name: /Payroll sections/i });
    await payrollNav.getByRole("link", { name: /^Employees$/i }).click();
    await expect(page.getByTestId("payroll-employee-form")).toBeVisible();

    await expect(page.getByRole("heading", { name: /Personal information/i })).toBeVisible();
    await expect(page.getByLabel(/Social Security Number/i)).toBeVisible();
    await expect(page.getByLabel(/Hire date \(first day of work\)/i)).toBeVisible();
    await expect(page.getByLabel(/^City$/i)).toBeVisible();
    await expect(page.getByLabel(/^State$/i)).toBeVisible();
    await expect(page.getByLabel(/ZIP code/i)).toBeVisible();
    await expect(page.getByRole("group", { name: /Pay type/i })).toBeVisible();

    await page.getByLabel(/Hourly rate/i).fill("25");
    await expect(page.getByTestId("payroll-pay-preview")).toContainText("$52,000.00");
    await expect(page.getByTestId("payroll-pay-preview")).toContainText("$1,000.00");

    await expect(page.getByLabel(/Routing number/i)).toHaveCount(0);
    await page.getByText(/Pay by direct deposit/i).click();
    await expect(page.getByLabel(/Routing number/i)).toBeVisible();

    await expect(page.getByText(/Advanced payroll settings/i)).toBeVisible();
  });

  test("API: employee, hours, calculate Jorge 7×$25", async ({ page }) => {
    const stamp = Date.now();
    const api = page.request;
    const employee = await createPayrollEmployee(api, stamp);
    const run = await createPayRun(api, stamp);

    const patchRes = await api.patch(`${ORIGIN}/api/payroll/runs/${run.id}`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        items: [
          {
            employeeId: employee.id,
            hoursRegular: 7,
            hoursOvertime: 0,
            hourlyRate: 25,
          },
        ],
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    const calcRes = await api.post(`${ORIGIN}/api/payroll/runs/${run.id}/calculate`, {
      headers: ORIGIN_HEADERS,
    });
    expect(calcRes.ok()).toBeTruthy();
    const calcPayload = await calcRes.json();
    expect(calcPayload.success).toBeTruthy();

    const items = calcPayload.data?.items || [];
    expect(items.length).toBeGreaterThan(0);
    const line = items.find((row) => row.employeeId === employee.id) || items[0];
    expect(Number(line.grossPay)).toBe(175);
    expect(Number(line.netPay)).toBe(161.61);

    await page.goto(`/payroll/runs/${run.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-run-detail")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("cell", { name: "$175.00" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Gross pay/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Net pay/i })).toBeVisible();
  });
});
