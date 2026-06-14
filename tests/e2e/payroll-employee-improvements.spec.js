const { test, expect } = require("@playwright/test");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

async function devLoginAs(page, profile, redirect = "/payroll/employees") {
  await page.goto(
    `/api/auth/dev-login?profile=${encodeURIComponent(profile)}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: "commit" },
  );
  await page.waitForURL(/\/payroll\/employees/, { timeout: 45_000 });
}

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function createEmployee(api, data) {
  const res = await api.post(`${ORIGIN}/api/payroll/employees`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data,
  });
  expect(res.ok()).toBeTruthy();
  const payload = await res.json();
  expect(payload.success).toBeTruthy();
  return payload;
}

async function countEmployeesByName(api, lastName) {
  const res = await api.get(`${ORIGIN}/api/payroll/employees?status=all&limit=500`);
  expect(res.ok()).toBeTruthy();
  const payload = await res.json();
  return (payload.data || []).filter((row) => row.lastName === lastName).length;
}

async function addPayrollHistory(api, employeeId, stamp) {
  const runRes = await api.post(`${ORIGIN}/api/payroll/runs`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      title: `History run ${stamp}`,
      periodStart: isoDate(-13),
      periodEnd: isoDate(-1),
      payDate: isoDate(0),
      scheduleType: "biweekly",
    },
  });
  expect(runRes.ok()).toBeTruthy();
  const run = (await runRes.json()).data;

  const patchRes = await api.patch(`${ORIGIN}/api/payroll/runs/${run.id}`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      items: [
        {
          employeeId,
          hoursRegular: 8,
          hoursOvertime: 0,
          hourlyRate: 20,
        },
      ],
    },
  });
  expect(patchRes.ok()).toBeTruthy();

  const calcRes = await api.post(`${ORIGIN}/api/payroll/runs/${run.id}/calculate`, {
    headers: ORIGIN_HEADERS,
  });
  expect(calcRes.ok()).toBeTruthy();
}

test.describe("Payroll employee improvements", () => {
  test.setTimeout(120_000);

  test("API idempotency key prevents duplicate employee creation", async ({ page }) => {
    await devLoginAs(page, "admin");
    const stamp = Date.now();
    const lastName = `Idem ${stamp}`;
    const idempotencyKey = `test-idem-${stamp}`;
    const body = {
      firstName: "Idem",
      lastName,
      email: `idem.payroll+${stamp}@example.com`,
      workState: "TX",
      taxForm: "w2",
      payType: "hourly",
      hourlyRate: 20,
      filingStatus: "single",
      status: "active",
    };

    const first = await page.request.post(`${ORIGIN}/api/payroll/employees`, {
      headers: {
        ...ORIGIN_HEADERS,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      data: body,
    });
    expect(first.ok()).toBeTruthy();
    const firstPayload = await first.json();
    expect(firstPayload.success).toBeTruthy();

    const second = await page.request.post(`${ORIGIN}/api/payroll/employees`, {
      headers: {
        ...ORIGIN_HEADERS,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      data: body,
    });
    expect(second.ok()).toBeTruthy();
    const secondPayload = await second.json();
    expect(secondPayload.success).toBeTruthy();
    expect(secondPayload.data.id).toBe(firstPayload.data.id);
    expect(secondPayload.idempotentReplay).toBeTruthy();

    expect(await countEmployeesByName(page.request, lastName)).toBe(1);

    await page.request.delete(`${ORIGIN}/api/payroll/employees/${firstPayload.data.id}`, {
      headers: ORIGIN_HEADERS,
    });
  });

  test("double-click save creates only one employee", async ({ page }) => {
    await devLoginAs(page, "admin");
    await expect(page.getByTestId("payroll-employees-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("payroll-employee-form")).toBeVisible();

    const stamp = Date.now();
    const lastName = `Double ${stamp}`;

    await page.locator("#employee-first-name").fill("Double");
    await page.locator("#employee-last-name").fill(lastName);
    await page.locator("#employee-email").fill(`double.payroll+${stamp}@example.com`);

    const saveButton = page.getByTestId("payroll-employee-save");
    await saveButton.click();
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toContainText(/Saving/i);

    await expect(page.getByText("Employee saved.")).toBeVisible({ timeout: 20_000 });
    expect(await countEmployeesByName(page.request, lastName)).toBe(1);

    const listRes = await page.request.get(`${ORIGIN}/api/payroll/employees?status=all&limit=500`);
    const listPayload = await listRes.json();
    const created = (listPayload.data || []).find((row) => row.lastName === lastName);
    expect(created?.id).toBeTruthy();

    await page.request.delete(`${ORIGIN}/api/payroll/employees/${created.id}`, {
      headers: ORIGIN_HEADERS,
    });
  });

  test("employee with payroll history shows blocked delete and mark inactive", async ({
    page,
  }) => {
    await devLoginAs(page, "admin");
    const stamp = Date.now();
    const employee = (
      await createEmployee(page.request, {
        firstName: "Blocked",
        lastName: `Delete ${stamp}`,
        email: `blocked.payroll+${stamp}@example.com`,
        workState: "TX",
        taxForm: "w2",
        payType: "hourly",
        hourlyRate: 20,
        filingStatus: "single",
        status: "active",
      })
    ).data;

    await addPayrollHistory(page.request, employee.id, stamp);

    await page.reload({ waitUntil: "domcontentloaded" });
    const fullName = employee.fullName || `Blocked Delete ${stamp}`;
    await expect(page.getByText(fullName)).toBeVisible({ timeout: 15_000 });

    await page.getByTestId(`payroll-delete-employee-${employee.id}`).click();
    const modal = page.getByTestId("payroll-delete-employee-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Cannot delete employee/i)).toBeVisible();
    await expect(modal.getByText(/payroll history/i)).toBeVisible();
    await expect(page.getByTestId("payroll-mark-inactive-confirm")).toBeVisible();

    await page.getByTestId("payroll-mark-inactive-confirm").click();
    await expect(page.getByText("Employee marked inactive.")).toBeVisible({
      timeout: 15_000,
    });

    const getRes = await page.request.get(`${ORIGIN}/api/payroll/employees/${employee.id}`);
    expect(getRes.ok()).toBeTruthy();
    const getPayload = await getRes.json();
    expect(getPayload.data.status).toBe("inactive");

    const deleteRes = await page.request.delete(
      `${ORIGIN}/api/payroll/employees/${employee.id}`,
      { headers: ORIGIN_HEADERS },
    );
    expect(deleteRes.status()).toBe(409);
  });

  test("admin can scan and cleanup duplicate employees", async ({ page }) => {
    await devLoginAs(page, "admin");
    const stamp = Date.now();
    const shared = {
      firstName: "Dup",
      lastName: `Cleanup ${stamp}`,
      email: `dup.cleanup+${stamp}@example.com`,
      phone: "5125550199",
      workState: "TX",
      taxForm: "w2",
      payType: "hourly",
      hourlyRate: 18,
      filingStatus: "single",
      status: "active",
    };

    const first = (await createEmployee(page.request, shared)).data;
    const second = (await createEmployee(page.request, shared)).data;
    expect(first.id).not.toBe(second.id);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payroll-duplicates-panel")).toBeVisible();

    const beforeRes = await page.request.get(`${ORIGIN}/api/payroll/employees?status=all&limit=500`);
    const beforeTotal = (await beforeRes.json()).pagination?.total;

    await page.getByTestId("payroll-scan-duplicates").click();
    await expect(page.getByText(/duplicate group/i)).toBeVisible({ timeout: 15_000 });

    const cleanupButton = page.getByTestId("payroll-cleanup-duplicates");
    await expect(cleanupButton).toBeVisible();
    await cleanupButton.click();

    await expect(page.getByText(/Removed .* duplicate employee record/i)).toBeVisible({
      timeout: 15_000,
    });

    const afterRes = await page.request.get(`${ORIGIN}/api/payroll/employees?status=all&limit=500`);
    const afterPayload = await afterRes.json();
    expect(afterPayload.pagination?.total).toBe(beforeTotal - 1);

    const remaining = (afterPayload.data || []).filter(
      (row) => row.lastName === shared.lastName,
    );
    expect(remaining).toHaveLength(1);

    await page.request.delete(`${ORIGIN}/api/payroll/employees/${remaining[0].id}`, {
      headers: ORIGIN_HEADERS,
    });
  });
});
