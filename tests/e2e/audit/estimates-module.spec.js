/**
 * Estimates module — full contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/estimates-module.spec.js
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

async function createClientAndEstimate(api, stamp, overrides = {}) {
  const clientName = overrides.clientName || `Est Audit Client ${stamp}`;
  const clientRes = await api.post(`${ORIGIN}/api/clients`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      name: clientName,
      email: overrides.email || `est.audit+${stamp}@example.com`,
      phone: "+15550003333",
      address: "300 Estimate Blvd",
      city: "Austin",
      state: "TX",
      zip: "73301",
    },
  });
  expect(clientRes.ok()).toBeTruthy();
  const clientId = (await clientRes.json())?.data?.id;
  expect(clientId).toBeTruthy();

  const estRes = await api.post(`${ORIGIN}/api/estimates`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      clientName,
      clientEmail: overrides.email || `est.audit+${stamp}@example.com`,
      clientPhone: "+15550003333",
      address: "300 Estimate Blvd, Austin, TX 73301",
      services: [
        { id: "base_price", name: "Base Price", qty: 1, unitPrice: 1800, price: 1800 },
      ],
      subtotal: 1800,
      tax: 0,
      total: 1800,
      status: "draft",
      notes: overrides.notes || `Audit scope ${stamp}`,
      clientUuid: clientId,
    },
  });
  expect(estRes.ok()).toBeTruthy();
  const estimate = (await estRes.json())?.data;
  expect(estimate?.id).toBeTruthy();
  return { clientName, clientId, estimate };
}

async function createClientOnly(api, stamp) {
  const clientName = `Est Client Only ${stamp}`;
  const clientRes = await api.post(`${ORIGIN}/api/clients`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      name: clientName,
      email: `client.only+${stamp}@example.com`,
      phone: "+15550004444",
      address: "400 Client Row",
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

async function openKanbanEstimate(page, clientName) {
  await page.goto("/estimates", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^Estimates$/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Search estimates").fill(clientName);
  await page.getByLabel("Hide test data").uncheck();
  const card = page.getByRole("button", { name: new RegExp(clientName) });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
}

test.describe("Estimates module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/estimates" });
    await expect(page.getByRole("heading", { name: /^Estimates$/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`kanban layout: ${viewport.name} — toolbar and columns`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByLabel("Search estimates")).toBeVisible();
      await expect(page.getByLabel("Filter by status")).toBeVisible();
      await expect(page.getByLabel("Hide test data")).toBeVisible();
      await expect(page.getByRole("button", { name: /\+ New Estimate/i })).toBeVisible();
      await expect(
        page.locator("span").filter({ hasText: /^Draft$/ }).first(),
      ).toBeVisible();
    });
  }

  test("toolbar: search, status filter, refresh, new estimate navigation", async ({
    page,
  }) => {
    await page.getByLabel("Search estimates").fill("zzzz-est-audit-no-match");
    await expect(page.getByText(/0 shown/i)).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Filter by status").selectOption("draft");
    await expect(page.getByText(/shown/i)).toBeVisible();

    await page.getByRole("button", { name: /^Refresh$/i }).click();
    await expect(page.getByText(/shown/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /\+ New Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /New Estimate/i })).toBeVisible();
  });

  test("editor: create draft, persist scope after save and reload", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `Est Editor ${stamp}`;
    const { clientId } = await createClientAndEstimate(page.request, stamp, {
      clientName,
      notes: "placeholder",
    });

    await page.goto(`/estimates/new?clientId=${encodeURIComponent(clientId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByLabel("Client first name")).toHaveValue(/Est/, {
      timeout: 15_000,
    });

    const scopeNote = `Editor scope ${stamp}`;
    await page.getByPlaceholder(/Describe the work/i).fill(scopeNote);
    await page.getByLabel("Base price ($)").fill("2200");
    await page.getByRole("button", { name: /Save as draft/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new\?edit=/, { timeout: 20_000 });

    await expect(page.getByPlaceholder(/Describe the work/i)).toHaveValue(scopeNote, {
      timeout: 10_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Loading estimate/i)).toBeHidden({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/Describe the work/i)).toHaveValue(scopeNote, {
      timeout: 15_000,
    });

    await expect(page.getByRole("link", { name: /Print estimate/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download PDF/i })).toBeVisible();
  });

  test("editor: client search dropdown and prefix select", async ({ page }) => {
    await page.goto("/estimates/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("combobox", { name: /Search clients/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel("Client prefix").selectOption("Mr.");
    await expect(page.getByLabel("Client prefix")).toHaveValue("Mr.");
  });

  test("kanban detail: send, PDF, contract, duplicate, approve confirm", async ({
    page,
  }) => {
    const stamp = Date.now();
    const clientName = `Est Kanban ${stamp}`;
    const { estimate } = await createClientAndEstimate(page.request, stamp, {
      clientName,
    });

    await openKanbanEstimate(page, clientName);

    await expect(page.getByRole("link", { name: /Print estimate/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Download PDF/i })).toBeVisible();

    const pdfRes = await page.request.get(
      `${ORIGIN}/api/estimates/${estimate.id}/pdf`,
      { headers: ORIGIN_HEADERS },
    );
    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()["content-type"] || "").toMatch(/pdf/i);

    const downloadRes = await page.request.get(
      `${ORIGIN}/api/estimates/${estimate.id}/pdf?download=1`,
      { headers: ORIGIN_HEADERS },
    );
    expect(downloadRes.ok()).toBeTruthy();

    await page.getByRole("button", { name: /Send to client/i }).click();
    await expect(page.getByText(/sent to|Estimate sent/i)).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /Generate contract/i }).click();
    await page.getByLabel("Contract language").selectOption("en");
    await page.getByRole("button", { name: /Save contract/i }).click();
    await expect(page.getByText(/Contract saved/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Print contract/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Download contract PDF/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Approve/i }).click();
    await page.getByRole("button", { name: /^Confirm$/i }).click();
    await expect(page.getByRole("button", { name: /Edit estimate/i })).toBeHidden({
      timeout: 10_000,
    });
    await openKanbanEstimate(page, clientName);
    await expect(page.locator('[class*="badgeApproved"]')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /Duplicate/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new\?edit=/, { timeout: 20_000 });
    expect(page.url()).not.toContain(String(estimate.id));
  });

  test("kanban: edit estimate link opens editor", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `Est Edit Link ${stamp}`;
    const { estimate } = await createClientAndEstimate(page.request, stamp, { clientName });

    await openKanbanEstimate(page, clientName);
    await page.getByRole("button", { name: /Edit estimate/i }).click();
    await expect(page).toHaveURL(new RegExp(`/estimates/new\\?edit=${estimate.id}`), {
      timeout: 15_000,
    });
  });

  test("kanban: close detail panel", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `Est Close ${stamp}`;
    await createClientAndEstimate(page.request, stamp, { clientName });
    await openKanbanEstimate(page, clientName);
    await expect(page.getByRole("button", { name: /Edit estimate/i })).toBeVisible();
    await page.getByRole("button", { name: /Close estimate details/i }).click();
    await expect(page.getByRole("button", { name: /Edit estimate/i })).toBeHidden({
      timeout: 10_000,
    });
  });

  test("clientId URL filter and clear", async ({ page }) => {
    const stamp = Date.now();
    const { clientId, clientName } = await createClientAndEstimate(page.request, stamp);

    await page.goto(`/estimates?clientId=${encodeURIComponent(clientId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/filtered by client/i)).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Hide test data").uncheck();
    await expect(page.getByRole("button", { name: new RegExp(clientName) })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /Clear client filter/i }).click();
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 10_000 });
  });

  test("sign-off: create estimate via UI (+ New Estimate)", async ({ page }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const { clientName, clientId } = await createClientOnly(page.request, stamp);

    await page.getByRole("button", { name: /\+ New Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new/, { timeout: 15_000 });

    await page.goto(`/estimates/new?clientId=${encodeURIComponent(clientId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByLabel("Client first name")).toHaveValue(/.+/, {
      timeout: 15_000,
    });

    await page.getByLabel("Base price ($)").fill("950");
    await page.getByRole("button", { name: /Save as draft/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new\?edit=/, { timeout: 20_000 });

    await page.goto("/estimates", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Search estimates").fill(clientName);
    await page.getByLabel("Hide test data").uncheck();
    await expect(page.getByRole("button", { name: new RegExp(clientName) })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("sign-off: editor Save & Send preview then client link after kanban send", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const { clientName, clientId } = await createClientOnly(page.request, stamp);

    await page.goto(`/estimates/new?clientId=${encodeURIComponent(clientId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByLabel("Client first name")).toHaveValue(/.+/, {
      timeout: 15_000,
    });
    await page.getByLabel("Base price ($)").fill("1100");
    await page.getByLabel(/Save and send to client/i).click();
    await expect(
      page.getByRole("dialog", { name: /Preview estimate before sending/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Send to customer/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new\?edit=/, { timeout: 25_000 });

    await openKanbanEstimate(page, clientName);
    await expect(page.getByText(/Sent:/i)).toBeVisible({ timeout: 15_000 });
    const clientLink = page.getByRole("link", { name: /Client link/i });
    await expect(clientLink).toHaveAttribute("href", /\/estimate\//);
  });

  test("sign-off: decline workflow with confirm", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `Est Decline ${stamp}`;
    await createClientAndEstimate(page.request, stamp, { clientName });
    await openKanbanEstimate(page, clientName);
    await page.getByRole("button", { name: /^Decline$/i }).click();
    await page.getByRole("button", { name: /^Confirm$/i }).click();
    await expect(page.getByRole("button", { name: /Edit estimate/i })).toBeHidden({
      timeout: 10_000,
    });
    await page.getByLabel("Filter by status").selectOption("declined");
    await page.getByLabel("Search estimates").fill(clientName);
    await expect(page.getByRole("button", { name: new RegExp(clientName) })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("sign-off: kanban columns and status filter alignment", async ({ page }) => {
    await expect(page.locator("span").filter({ hasText: /^Sent$/ }).first()).toBeVisible();
    await expect(page.locator("span").filter({ hasText: /^Approved$/ }).first()).toBeVisible();
    await page.getByLabel("Filter by status").selectOption("sent");
    await expect(page.getByText(/shown/i)).toBeVisible();
  });

  for (const viewport of VIEWPORTS) {
    test(`editor layout: ${viewport.name} — save actions visible`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/estimates/new", { waitUntil: "domcontentloaded" });
      const saveDraft = page.getByRole("button", { name: /Save as draft/i });
      await saveDraft.scrollIntoViewIfNeeded();
      await expect(saveDraft).toBeVisible({ timeout: 15_000 });
      const saveSend = page.getByLabel(/Save and send to client/i);
      await saveSend.scrollIntoViewIfNeeded();
      await expect(saveSend).toBeVisible();
      await expect(page.getByText("Base price ($)")).toBeVisible();
    });
  }
});
