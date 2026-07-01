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

async function openNewInvoiceBuilder(page) {
  await page.getByTestId("invoices-new-button").click();
  await expect(page.getByTestId("invoices-form-section")).toBeVisible();
}

async function openInvoiceAdvanced(page) {
  await page.getByRole("button", { name: /Advanced options/i }).click();
}

async function openInvoiceCardMenu(page, card) {
  await card.getByRole("button", { name: /Invoice actions/i }).click();
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
      billingAddress: "PO Box 900",
      billingCity: "Austin",
      billingState: "TX",
      billingZip: "73302",
      billingSameAsService: false,
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
      await expect(page.getByTestId("invoices-new-button")).toBeVisible();
      await openNewInvoiceBuilder(page);
      await expect(page.getByRole("combobox", { name: /Search clients/i })).toBeVisible();
      await page.getByTestId("invoice-builder-back").click();
      await expect(page.getByLabel(/Search invoices/i)).toBeVisible();
      await expect(page.getByRole("heading", { name: /Invoice list/i })).toBeVisible();
    });
  }

  test("create invoice via UI, search, PDF actions, persist after refresh", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const invNum = `INV-AUDIT-${stamp}`;
    const clientName = `UI Inv Client ${stamp}`;

    const title = `Audit title ${stamp}`;
    await openNewInvoiceBuilder(page);
    await openInvoiceAdvanced(page);
    await page.getByLabel(/^Invoice number$/i).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByLabel(/^Invoice title$/i).fill(title);
    await page.getByLabel(/^Amount$/i).fill("880");
    await page.getByLabel(/^Due date$/i).fill("2026-12-15");
    await page.getByRole("button", { name: /Save draft/i }).click();
    await page.getByTestId("invoice-builder-back").click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card).toBeVisible({ timeout: 25_000 });
    await expect(
      card.getByRole("link", { name: /Print invoice document/i }),
    ).toBeVisible();
    await expect(card.getByRole("link", { name: /Download PDF/i })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel(/Search invoices/i).fill(clientName);
    await expect(getInvoiceCard(page, clientName)).toBeVisible({ timeout: 15_000 });
    await expect(getInvoiceCard(page, invNum)).toBeVisible();
  });

  test("edit invoice — update amount persists after reload", async ({ page }) => {
    const stamp = Date.now();
    const invNum = `INV-EDIT-${stamp}`;

    const clientName = `Edit Inv ${stamp}`;
    await openNewInvoiceBuilder(page);
    await openInvoiceAdvanced(page);
    await page.getByLabel(/^Invoice number$/i).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByLabel(/^Amount$/i).fill("400");
    await page.getByLabel(/^Due date$/i).fill("2026-11-01");
    await page.getByRole("button", { name: /Save draft/i }).click();
    await page.getByTestId("invoice-builder-back").click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card).toBeVisible({ timeout: 15_000 });

    await openInvoiceCardMenu(page, card);
    await page.getByRole("menuitem", { name: /^Edit$/i }).click();
    await expect(page.getByRole("heading", { name: /Edit invoice/i })).toBeVisible();
    await openInvoiceAdvanced(page);
    await page.getByLabel(/^Amount$/i).fill("550");
    await page.getByRole("button", { name: /^Update$/i }).click();
    await page.getByTestId("invoice-builder-back").click();

    await expect(page.getByRole("heading", { name: /Invoice list/i })).toBeVisible({
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
    const pdfBytes = await pdfRes.body();
    const pdfText = pdfBytes.toString("latin1");
    // Footer link is Flate-compressed; assert PDF link annotation for Powered by FieldBase.
    expect(pdfText).toContain("/Subtype /Link");
    expect(pdfText).toMatch(/\/URI \(https:\/\/fieldbaseapp\.net\)/);
  });

  test("register partial cash payment updates balance", async ({ page }) => {
    const stamp = Date.now();
    const invNum = `INV-PAY-${stamp}`;

    const clientName = `Pay Client ${stamp}`;
    await openNewInvoiceBuilder(page);
    await openInvoiceAdvanced(page);
    await page.getByLabel(/^Invoice number$/i).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByLabel(/^Amount$/i).fill("200");
    await page.getByLabel(/^Due date$/i).fill("2026-08-01");
    await page.getByRole("button", { name: /Save draft/i }).click();
    await page.getByTestId("invoice-builder-back").click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card).toBeVisible({ timeout: 15_000 });

    await openInvoiceCardMenu(page, card);
    await page.getByRole("menuitem", { name: /^Register payment$/i }).click();
    await expect(page.getByRole("button", { name: /Save payment/i })).toBeVisible();

    await page.getByTestId("invoice-payment-modal").locator("select").selectOption("cash");
    await page.getByTestId("invoice-payment-modal").getByPlaceholder("Amount", { exact: true }).fill("75");
    await page.getByTestId("invoice-payment-modal").getByPlaceholder("Notes", { exact: true }).fill("Cash on site");
    await page.getByRole("button", { name: /Save payment/i }).click();

    await expect(card.getByText(/Partial/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/Paid: \$75\.00/)).toBeVisible();
    await expect(card.getByText(/Balance: \$125\.00/)).toBeVisible();
  });

  test("line items editor updates invoice amount and persists", async ({ page }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const invNum = `INV-LINES-${stamp}`;
    const clientName = `Lines Client ${stamp}`;

    await openNewInvoiceBuilder(page);
    await openInvoiceAdvanced(page);
    await page.getByLabel(/^Invoice number$/i).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByLabel(/^Due date$/i).fill("2026-12-20");

    await expect(page.getByTestId("invoice-line-items-section")).toBeVisible();
    const row = page.getByTestId("invoice-line-item-row").first();
    await row.getByTestId("invoice-line-item-description").fill("Site labor");
    const numberInputs = row.locator('input[type="number"]');
    await numberInputs.nth(0).fill("2");
    await numberInputs.nth(1).fill("175");

    await expect(page.getByTestId("invoice-line-items-total")).toContainText("$350.00");
    await openInvoiceAdvanced(page);
    await expect(page.getByLabel(/^Amount$/i)).toHaveValue("350");

    await page.getByRole("button", { name: /Save draft/i }).click();
    await page.getByTestId("invoice-builder-back").click();
    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/Amount: \$350/)).toBeVisible();

    await openInvoiceCardMenu(page, card);
    await page.getByRole("menuitem", { name: /^Edit$/i }).click();
    await expect(page.getByTestId("invoice-line-items-section")).toBeVisible();
    await expect(page.getByTestId("invoice-line-item-description").first()).toHaveValue(
      "Site labor",
    );
  });

  test("invoice without line items has no line-item summary on card", async ({
    page,
  }) => {
    const stamp = Date.now();
    const invNum = `INV-NOLINES-${stamp}`;
    const clientName = `No Lines ${stamp}`;

    await openNewInvoiceBuilder(page);
    await openInvoiceAdvanced(page);
    await page.getByLabel(/^Invoice number$/i).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByLabel(/^Amount$/i).fill("99");
    await page.getByLabel(/^Due date$/i).fill("2026-12-01");
    await page.getByRole("button", { name: /Save draft/i }).click();
    await page.getByTestId("invoice-builder-back").click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/Line items subtotal/i)).toHaveCount(0);
  });

  test("invoice enriches addresses from client name when client_id was missing", async ({
    page,
  }) => {
    const stamp = Date.now();
    const { clientName, clientId } = await createClient(page.request, stamp);

    const invRes = await page.request.post(`${ORIGIN}/api/invoices`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        invoiceNumber: `INV-LINK-${stamp}`,
        clientName,
        amount: "120",
        dueDate: "2026-12-01",
        status: "Unpaid",
      },
    });
    expect(invRes.ok()).toBeTruthy();
    const invId = (await invRes.json())?.data?._id;
    expect(invId).toBeTruthy();

    const getRes = await page.request.get(`${ORIGIN}/api/invoices/${invId}`, {
      headers: ORIGIN_HEADERS,
    });
    expect(getRes.ok()).toBeTruthy();
    const invoice = await getRes.json();
    expect(invoice.clientId || invoice.client_id).toBe(clientId);
    expect(String(invoice.clientAddress || "")).toMatch(/PO Box 900/i);
    expect(String(invoice.propertyAddress || "")).toMatch(/600 Invoice Ave/i);
  });

  test("invoice snapshots client billing and job-site addresses", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const { clientName, clientId } = await createClient(page.request, stamp);

    const invRes = await page.request.post(`${ORIGIN}/api/invoices`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        invoiceNumber: `INV-ADDR-${stamp}`,
        clientName,
        clientId,
        amount: "250",
        dueDate: "2026-12-01",
        status: "Unpaid",
      },
    });
    expect(invRes.ok()).toBeTruthy();
    const invoice = (await invRes.json())?.data;
    expect(invoice?.clientAddress).toMatch(/PO Box 900/i);
    expect(invoice?.propertyAddress).toMatch(/600 Invoice Ave/i);
    expect(invoice?.clientPhone).toMatch(/5550006666|555-000-06666/);

    await page.goto("/invoices", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/Search invoices/i).fill(clientName);
    const card = getInvoiceCard(page, clientName);
    await expect(card.getByText(/Job site/i)).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/600 Invoice Ave/i)).toBeVisible();
  });

  test("send invoice email includes card and Zelle payment instructions", async ({
    page,
  }) => {
    const stamp = Date.now();
    const email = `inv.pay+${stamp}@example.com`;
    const zelleEmail = `zelle+${stamp}@contractor.test`;

    const profileRes = await page.request.patch(`${ORIGIN}/api/company-profile`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        clientPayments: {
          zelleEmail,
          zellePhone: "+15551234000",
        },
      },
    });
    expect(profileRes.ok()).toBeTruthy();

    const invRes = await page.request.post(`${ORIGIN}/api/invoices`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        invoiceNumber: `INV-PAY-${stamp}`,
        clientName: `Pay Flow ${stamp}`,
        clientEmail: email,
        amount: "275",
        dueDate: "2026-12-20",
        status: "Unpaid",
        preferredPaymentMethod: "zelle",
      },
    });
    expect(invRes.ok()).toBeTruthy();
    const invId = (await invRes.json())?.data?._id;
    expect(invId).toBeTruthy();

    const sendRes = await page.request.post(`${ORIGIN}/api/invoices/${invId}/send`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { recipientEmail: email },
    });
    expect(sendRes.ok()).toBeTruthy();
    const sendJson = await sendRes.json();
    expect(sendJson?.success).toBe(true);
    expect(sendJson?.data?.recipientEmail).toBe(email);

    const lines = sendJson?.data?.paymentInstructions?.textLines || [];
    const blob = lines.join("\n");
    expect(blob).toMatch(/Credit|debit card/i);
    expect(blob).toMatch(/Zelle/i);
    expect(blob).toContain(zelleEmail);
    expect(sendJson?.data?.paymentInstructions?.includesZelle).toBe(true);

    const checkoutRes = await page.request.post(
      `${ORIGIN}/api/invoices/${invId}/checkout`,
      {
        headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
        data: { amount: "275" },
      },
    );
    if (checkoutRes.ok()) {
      const checkoutJson = await checkoutRes.json();
      const checkoutUrl = String(checkoutJson?.data?.checkoutUrl || "").trim();
      if (checkoutUrl) {
        expect(checkoutUrl).toMatch(/^https?:\/\//i);
        expect(sendJson?.data?.paymentInstructions?.includesCardLink).toBe(true);
      }
    }
  });

  test("clear form exits edit mode", async ({ page }) => {
    const stamp = Date.now();
    const invNum = `INV-CLEAR-${stamp}`;

    const clientName = `Clear ${stamp}`;
    await page.getByLabel(/^Invoice number$/i).fill(invNum);
    await page.getByRole("combobox", { name: /Search clients/i }).fill(clientName);
    await page.getByLabel(/^Amount$/i).fill("100");
    await page.getByLabel(/^Due date$/i).fill("2026-07-01");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search invoices/i).fill(clientName);
    await getInvoiceCard(page, clientName).getByRole("button", { name: /^Edit$/i }).click();
    await expect(page.getByRole("heading", { name: /Edit invoice/i })).toBeVisible();
    await page.getByRole("button", { name: /^Clear$/i }).click();
    await expect(page.getByRole("heading", { name: /New invoice/i })).toBeVisible();
    await expect(page.getByLabel(/^Invoice number$/i)).toHaveValue("");
  });

  test("invoice totals page shows paid and unpaid summary", async ({ page }) => {
    await page.goto("/invoices/summary", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("invoice-revenue-summary")).toBeVisible({
      timeout: 15_000,
    });

    const apiRes = await page.request.get(`${ORIGIN}/api/invoices/summary`, {
      headers: ORIGIN_HEADERS,
    });
    expect(apiRes.ok()).toBeTruthy();
    const payload = await apiRes.json();
    expect(payload.success).toBeTruthy();
    expect(payload.data?.summary?.totalPaid).toBeGreaterThanOrEqual(0);
    expect(payload.data?.summary?.totalUnpaid).toBeGreaterThanOrEqual(0);

    await page.getByRole("link", { name: /Back to invoices|Volver a facturas/i }).click();
    await expect(page.getByRole("heading", { name: /^Invoices$|Facturas/i })).toBeVisible();
  });
});
