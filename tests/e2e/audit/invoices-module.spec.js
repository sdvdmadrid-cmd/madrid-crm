/**
 * Invoices module — contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/invoices-module.spec.js
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

function getInvoiceCard(page, marker) {
  return page.getByTestId("invoice-card").filter({
    hasText: marker,
  }).first();
}

async function createClient(api, stamp) {
  const clientName = `Inv Audit Client ${stamp}`;
  const clientRes = await api.post(`${ORIGIN}/api/clients`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      name: clientName,
      email: `inv.audit+${stamp}@example.com`,
      phone: "+15550006666",
      address: "600 Invoice Ave",
      city: "Austin",
      state: "TX",
      zip: "73301",
    },
  });
  expect(clientRes.ok()).toBeTruthy();
  const clientId = (await clientRes.json())?.data?.id;
  expect(clientId).toBeTruthy();
  return { clientName, clientId };
}

test.describe("Invoices module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/invoices" });
    await expect(page.getByRole("heading", { name: /^Invoices$/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`layout: ${viewport.name} — form and list search`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByRole("combobox", { name: /Search clients/i })).toBeVisible();
      await expect(page.getByLabel(/Search invoices/i)).toBeVisible();
      await expect(page.getByRole("heading", { name: /Invoice list/i })).toBeVisible();
    });
  }

  test("create invoice via UI, search, PDF actions, persist after refresh", async ({
    page,
  }) => {
    const stamp = Date.now();
    const invNum = `INV-AUDIT-${stamp}`;
    const clientName = `UI Inv Client ${stamp}`;

    const title = `Audit title ${stamp}`;
    await page.getByPlaceholder("Invoice number", { exact: true }).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByPlaceholder("Invoice title", { exact: true }).fill(title);
    await page.getByPlaceholder("Amount", { exact: true }).fill("880");
    await page.locator('input[type="date"]').first().fill("2026-12-15");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(
      card.getByRole("link", { name: /Print \/ Save PDF document/i }),
    ).toBeVisible();
    await expect(card.getByRole("link", { name: /Download PDF/i })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel(/Search invoices/i).fill(clientName);
    await expect(getInvoiceCard(page, clientName)).toBeVisible({ timeout: 15_000 });
    await expect(getInvoiceCard(page, title)).toBeVisible();
  });

  test("edit invoice — update amount persists after reload", async ({ page }) => {
    const stamp = Date.now();
    const invNum = `INV-EDIT-${stamp}`;

    const clientName = `Edit Inv ${stamp}`;
    await page.getByPlaceholder("Invoice number", { exact: true }).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByPlaceholder("Amount", { exact: true }).fill("400");
    await page.locator('input[type="date"]').first().fill("2026-11-01");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole("button", { name: /^Edit$/i }).click();
    await expect(page.getByRole("heading", { name: /Edit invoice/i })).toBeVisible();
    await page.getByPlaceholder("Amount", { exact: true }).fill("550");
    await page.getByRole("button", { name: /^Update$/i }).click();

    await expect(page.getByRole("heading", { name: /New invoice/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByLabel(/Search invoices/i).fill(clientName);
    await expect(getInvoiceCard(page, clientName).getByText(/Amount: \$550/)).toBeVisible({
      timeout: 15_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel(/Search invoices/i).fill(clientName);
    await expect(getInvoiceCard(page, clientName).getByText(/Amount: \$550/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("?clientId= filter and show all", async ({ page }) => {
    const stamp = Date.now();
    const { clientName, clientId } = await createClient(page.request, stamp);
    const invNum = `INV-FILTER-${stamp}`;

    const invRes = await page.request.post(`${ORIGIN}/api/invoices`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        invoiceNumber: invNum,
        clientName,
        clientId,
        amount: "320",
        dueDate: "2026-10-01",
        status: "Unpaid",
      },
    });
    expect(invRes.ok()).toBeTruthy();

    await page.goto(`/invoices?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/selected client only/i)).toBeVisible();
    await expect(getInvoiceCard(page, clientName)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Show all/i }).click();
    await expect(page).toHaveURL(/\/invoices$/);
    await page.getByLabel(/Search invoices/i).fill(clientName);
    await expect(getInvoiceCard(page, clientName)).toBeVisible({ timeout: 15_000 });
  });

  test("invoice PDF API returns application/pdf", async ({ page }) => {
    const stamp = Date.now();
    const invRes = await page.request.post(`${ORIGIN}/api/invoices`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        invoiceNumber: `INV-PDF-${stamp}`,
        clientName: "PDF Client",
        amount: "199",
        dueDate: "2026-09-01",
        status: "Unpaid",
      },
    });
    expect(invRes.ok()).toBeTruthy();
    const invId = (await invRes.json())?.data?._id;
    expect(invId).toBeTruthy();

    const pdfRes = await page.request.get(`${ORIGIN}/api/invoices/${invId}/pdf`, {
      headers: ORIGIN_HEADERS,
    });
    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()["content-type"] || "").toMatch(/pdf/i);
  });

  test("register partial cash payment updates balance", async ({ page }) => {
    const stamp = Date.now();
    const invNum = `INV-PAY-${stamp}`;

    const clientName = `Pay Client ${stamp}`;
    await page.getByPlaceholder("Invoice number", { exact: true }).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByPlaceholder("Amount", { exact: true }).fill("200");
    await page.locator('input[type="date"]').first().fill("2026-08-01");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole("button", { name: /^Register payment$/i }).click();
    await expect(card.getByRole("button", { name: /Save payment/i })).toBeVisible();

    await card.locator("select").selectOption("cash");
    await card.getByPlaceholder("Amount", { exact: true }).fill("75");
    await card.getByPlaceholder("Notes", { exact: true }).fill("Cash on site");
    await card.getByRole("button", { name: /Save payment/i }).click();

    await expect(card.getByText(/Partial/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/Paid: \$75\.00/)).toBeVisible();
    await expect(card.getByText(/Balance: \$125\.00/)).toBeVisible();
  });

  test("clear form exits edit mode", async ({ page }) => {
    const stamp = Date.now();
    const invNum = `INV-CLEAR-${stamp}`;

    const clientName = `Clear ${stamp}`;
    await page.getByPlaceholder("Invoice number", { exact: true }).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByPlaceholder("Amount", { exact: true }).fill("100");
    await page.locator('input[type="date"]').first().fill("2026-07-01");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    await getInvoiceCard(page, clientName).getByRole("button", { name: /^Edit$/i }).click();
    await expect(page.getByRole("heading", { name: /Edit invoice/i })).toBeVisible();
    await page.getByRole("button", { name: /^Clear$/i }).click();
    await expect(page.getByRole("heading", { name: /New invoice/i })).toBeVisible();
    await expect(page.getByPlaceholder("Invoice number", { exact: true })).toHaveValue("");
  });
});
