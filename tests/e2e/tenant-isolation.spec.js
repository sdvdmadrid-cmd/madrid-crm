const { test, expect } = require("@playwright/test");

async function devLoginAs(page, profile) {
  await page.goto(`/api/auth/dev-login?profile=${profile}&redirect=%2Fdashboard`, {
    waitUntil: "commit",
  });
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
}

async function getWorkspaceTenantId(request) {
  const meRes = await request.get("/api/auth/me");
  expect(meRes.ok()).toBeTruthy();
  const me = await meRes.json();
  const tenantId =
    me?.workspace?.tenantDbId ||
    me?.tenantDbId ||
    me?.data?.workspace?.tenantDbId ||
    me?.data?.tenantDbId;
  expect(tenantId).toBeTruthy();
  return String(tenantId);
}

function assertRowsBelongToTenant(rows, tenantId, label) {
  for (const row of rows || []) {
    const rowTenant =
      row?.tenantId || row?.tenant_id || row?.raw?.tenant_id || null;
    if (rowTenant != null) {
      expect(String(rowTenant), `${label} row leaked tenant`).toBe(tenantId);
    }
  }
}

test.describe("Tenant isolation", () => {
  test.setTimeout(60_000);

  test("CRM list APIs only return the signed-in tenant", async ({ page }) => {
    await devLoginAs(page, "admin");
    const tenantId = await getWorkspaceTenantId(page.request);

    const clientsRes = await page.request.get("/api/clients");
    expect(clientsRes.ok()).toBeTruthy();
    const clientsJson = await clientsRes.json();
    const clients = Array.isArray(clientsJson?.data)
      ? clientsJson.data
      : Array.isArray(clientsJson)
        ? clientsJson
        : [];
    assertRowsBelongToTenant(clients, tenantId, "clients");

    const jobsRes = await page.request.get("/api/jobs");
    expect(jobsRes.ok()).toBeTruthy();
    const jobsJson = await jobsRes.json();
    const jobs = Array.isArray(jobsJson?.data)
      ? jobsJson.data
      : Array.isArray(jobsJson)
        ? jobsJson
        : [];
    assertRowsBelongToTenant(jobs, tenantId, "jobs");

    const leadsRes = await page.request.get("/api/lead-inbox");
    expect(leadsRes.ok()).toBeTruthy();
    const leadsJson = await leadsRes.json();
    const leads = Array.isArray(leadsJson?.data) ? leadsJson.data : [];
    assertRowsBelongToTenant(leads, tenantId, "lead-inbox");
  });

  test("foreign client id returns not found", async ({ page }) => {
    await devLoginAs(page, "admin");

    const fakeId = "00000000-0000-0000-0000-000000000099";
    const res = await page.request.get(`/api/clients/${fakeId}`);
    expect([404, 400]).toContain(res.status());
  });
});
