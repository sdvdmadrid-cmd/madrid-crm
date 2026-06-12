const { test, expect } = require("@playwright/test");

async function devLoginAs(page, profile, redirect = "/dashboard") {
  await page.goto(
    `/api/auth/dev-login?profile=${encodeURIComponent(profile)}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: "commit" },
  );
  const pathPattern =
    redirect === "/dashboard"
      ? /\/dashboard/
      : new RegExp(redirect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  await page.waitForURL(pathPattern, { timeout: 45_000 });
}

test.describe("RBAC role consistency", () => {
  test.setTimeout(60_000);

  test("contractor cannot create invoices via API", async ({ page }) => {
    await devLoginAs(page, "contractor", "/dashboard");

    const res = await page.request.post("/api/invoices", {
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      data: {
        clientName: "RBAC Test Client",
        amount: "100",
        dueDate: "2030-01-15",
        lineItems: [{ description: "Test", quantity: 1, unitPrice: 100 }],
      },
    });
    expect(res.status()).toBe(403);
  });

  test("contractor can patch but not delete appointments", async ({ page }) => {
    await devLoginAs(page, "contractor", "/dashboard");

    const stamp = Date.now();
    const dateYmd = "2030-06-15";
    const createRes = await page.request.post("/api/appointments", {
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      data: {
        title: `RBAC Apt ${stamp}`,
        clientName: "RBAC Client",
        date: dateYmd,
        time: "10:00",
        notes: "",
        status: "Scheduled",
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const id = created?.data?._id || created?.data?.id;
    expect(id).toBeTruthy();

    const patchRes = await page.request.patch(`/api/appointments/${id}`, {
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      data: {
        title: `RBAC Apt Updated ${stamp}`,
        clientName: "RBAC Client",
        date: dateYmd,
        time: "11:00",
        notes: "",
        status: "Scheduled",
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    const deleteRes = await page.request.delete(`/api/appointments/${id}`, {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(deleteRes.status()).toBe(403);

    await devLoginAs(page, "admin", "/dashboard");
    const adminDelete = await page.request.delete(`/api/appointments/${id}`, {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(adminDelete.ok()).toBeTruthy();
  });

  test("viewer cannot list clients", async ({ page }) => {
    await devLoginAs(page, "viewer", "/dashboard");

    const res = await page.request.get("/api/clients?limit=10&page=1");
    expect(res.status()).toBe(403);
  });
});
