/**
 * Extended contractor workflows — kanban actions, documents, leads, jobs,
 * invoices, payments settings, website publish API, reputation import.
 *
 * Run: npx playwright test tests/e2e/contractor-workflows.spec.js
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("./helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

async function createClientAndEstimate(api, stamp) {
  const clientName = `UX Flow Client ${stamp}`;
  const clientRes = await api.post("/api/clients", {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      name: clientName,
      email: `ux.flow+${stamp}@example.com`,
      phone: "+15550007777",
      address: "200 Workflow Ave",
      city: "Austin",
      state: "TX",
      zip: "73301",
    },
  });
  expect(clientRes.ok()).toBeTruthy();
  const clientId = (await clientRes.json())?.data?.id;
  expect(clientId).toBeTruthy();

  const estRes = await api.post("/api/estimates", {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      clientName,
      clientEmail: `ux.flow+${stamp}@example.com`,
      clientPhone: "+15550007777",
      address: "200 Workflow Ave, Austin, TX 73301",
      services: [
        { id: "base_price", name: "Base Price", qty: 1, unitPrice: 2200, price: 2200 },
      ],
      subtotal: 2200,
      tax: 0,
      total: 2200,
      status: "draft",
      notes: `Workflow scope ${stamp}`,
      clientUuid: clientId,
    },
  });
  expect(estRes.ok()).toBeTruthy();
  const estimate = (await estRes.json())?.data;
  expect(estimate?.id).toBeTruthy();
  return { clientName, clientId, estimate };
}

async function openEstimateInKanban(page, clientName) {
  await page.goto("/estimates", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Search estimates").fill(clientName);
  await page.getByLabel("Hide test data").uncheck();
  await expect(
    page.getByRole("button", { name: new RegExp(clientName) }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: new RegExp(clientName) }).click();
}

test.describe("Contractor workflows — documents & kanban actions", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
  });

  test("estimate PDF endpoint returns application/pdf", async ({ page }) => {
    const stamp = Date.now();
    const { estimate } = await createClientAndEstimate(page.request, stamp);

    const pdfRes = await page.request.get(`/api/estimates/${estimate.id}/pdf`, {
      headers: ORIGIN_HEADERS,
    });
    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()["content-type"] || "").toMatch(/application\/pdf/i);
    const body = await pdfRes.body();
    expect(body.byteLength).toBeGreaterThan(500);
  });

  test("kanban: send estimate, generate contract, duplicate, print PDF link", async ({
    page,
  }) => {
    const stamp = Date.now();
    const { clientName, estimate } = await createClientAndEstimate(page.request, stamp);

    await openEstimateInKanban(page, clientName);

    const printPdf = page.getByRole("link", { name: /Print estimate/i });
    await printPdf.scrollIntoViewIfNeeded();
    await expect(printPdf).toBeVisible({ timeout: 15_000 });
    await expect(printPdf).toHaveAttribute(
      "href",
      new RegExp(`/api/estimates/${estimate.id}/pdf`),
    );
    await expect(
      page.getByRole("link", { name: /Download PDF/i }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: /Send to client/i }).click();
    await expect(page.getByText(/sent to|Estimate sent/i)).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /Generate contract/i }).click();
    await page.getByRole("button", { name: /Save contract/i }).click();
    await expect(page.getByText(/Contract saved/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Print contract/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Download contract PDF/i }),
    ).toBeVisible();

    const editHrefBefore = page.url();
    await page.getByRole("button", { name: /Duplicate/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new\?edit=/, { timeout: 20_000 });
    expect(page.url()).not.toBe(editHrefBefore);
  });

  test("lead inbox: convert first open lead to estimate when queue has items", async ({
    page,
  }) => {
    const inboxRes = await page.request.get("/api/lead-inbox", {
      headers: ORIGIN_HEADERS,
    });
    expect(inboxRes.ok()).toBeTruthy();
    const inboxJson = await inboxRes.json();
    const items = (inboxJson?.data || []).filter(
      (row) => String(row.status || "").toLowerCase() !== "converted",
    );
    test.skip(items.length === 0, "No open leads in dev tenant — seed via website form on staging");

    await page.goto("/lead-inbox", { waitUntil: "domcontentloaded" });
    const convertBtn = page.getByRole("button", { name: /Convert to Estimate/i }).first();
    await expect(convertBtn).toBeVisible({ timeout: 15_000 });
    await convertBtn.click();
    await expect(
      page.getByText(/Converted to estimate successfully/i),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("jobs: create job via form and find in list search", async ({ page }) => {
    const stamp = Date.now();
    const title = `UX Job ${stamp}`;
    const clientName = `UX Job Client ${stamp}`;

    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Title", { exact: true }).fill(title);
    await page.getByPlaceholder("Client", { exact: true }).fill(clientName);
    await page.getByPlaceholder("Price", { exact: true }).fill("900");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search jobs/i).fill(title);
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("link", { name: /Print work order/i }).first(),
    ).toBeVisible();
  });

  test("invoices: create via API, print and send-by-email flow", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `UX Inv Client ${stamp}`;
    const email = `ux.inv+${stamp}@example.com`;

    const invRes = await page.request.post("/api/invoices", {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        clientName,
        clientEmail: email,
        invoiceTitle: `Workflow invoice ${stamp}`,
        amount: "450",
        dueDate: "2026-12-31",
        status: "Unpaid",
      },
    });
    expect(invRes.ok()).toBeTruthy();
    const invoiceJson = await invRes.json();
    const invId = invoiceJson?.data?._id || invoiceJson?.data?.id;
    expect(invId).toBeTruthy();

    await expect
      .poll(async () => {
        const listRes = await page.request.get("/api/invoices", {
          headers: ORIGIN_HEADERS,
        });
        const listJson = await listRes.json();
        const rows = Array.isArray(listJson) ? listJson : listJson?.data || [];
        return rows.some((row) => String(row.clientName || "") === clientName);
      })
      .toBeTruthy();

    const sendRes = await page.request.post(`/api/invoices/${invId}/send`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { recipientEmail: email },
    });
    expect(sendRes.ok()).toBeTruthy();

    const pdfRes = await page.request.get(`${ORIGIN}/api/invoices/${invId}/pdf`, {
      headers: ORIGIN_HEADERS,
    });
    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()["content-type"] || "").toMatch(/pdf/i);

    await page.goto("/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel(/Search invoices/i)).toBeVisible({ timeout: 15_000 });
  });

  test("payments settings and subscriptions pages load with actions", async ({ page }) => {
    await page.goto("/settings/payments", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Stripe|payment|Connect/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto("/subscriptions", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("website publishing via API surfaces on public site", async ({ page, playwright }) => {
    await page.goto("/website", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });

    const apiRes = await page.request.get("/api/website-builder", {
      headers: ORIGIN_HEADERS,
    });
    expect(apiRes.ok()).toBeTruthy();
    const slug = String((await apiRes.json())?.data?.slug || "").trim();
    expect(slug.length).toBeGreaterThan(1);

    const headline = `UX Publish ${Date.now()}`;
    const saveRes = await page.request.post("/api/website-builder", {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { headline, published: true },
    });
    expect(saveRes.ok()).toBeTruthy();

    const publicContext = await playwright.request.newContext();
    const publicRes = await publicContext.get(`/sites/${slug}`);
    expect(publicRes.status()).toBe(200);
    expect(await publicRes.text()).toContain(headline);
    await publicContext.dispose();
  });

  test("reputation: archive import saves a private review", async ({ page }) => {
    const stamp = Date.now();
    const reviewText = `UX import review ${stamp}`;

    await page.goto("/reputation", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Reviews & Reputation/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /Reviews/i }).click();
    await page.getByPlaceholder("Review URL (optional)").fill(`https://example.com/review/${stamp}`);
    await page.getByPlaceholder("Customer name").fill(`Reviewer ${stamp}`);
    await page.getByPlaceholder("Paste review text here").fill(reviewText);
    await page.getByRole("button", { name: /Save to archive/i }).click();

    await expect(page.getByText(/Saved|imported/i)).toBeVisible({ timeout: 15_000 });
  });

  test("client profile: print record button is available", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `UX Print Client ${stamp}`;

    await page.goto("/clients", { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: /Name/i }).fill(clientName);
    await page.getByRole("textbox", { name: /Email/i }).fill(`ux.print+${stamp}@example.com`);
    await page.getByRole("button", { name: /^Save$/i }).click();
    await expect(page.getByRole("heading", { name: clientName, level: 3 })).toBeVisible({
      timeout: 15_000,
    });

    const search = page.getByRole("combobox", { name: /Search clients/i });
    await search.fill(clientName);
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: new RegExp(clientName) }).click();

    await expect(
      page.getByRole("link", { name: /Print record/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
