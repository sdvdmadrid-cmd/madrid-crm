/**
 * Contracts module — contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/contracts-module.spec.js
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
  const clientName = overrides.clientName || `Contract Client ${stamp}`;
  const clientRes = await api.post(`${ORIGIN}/api/clients`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      name: clientName,
      email: overrides.email || `contract.audit+${stamp}@example.com`,
      phone: "+15550007777",
      address: "700 Contract Way",
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
      clientEmail: overrides.email || `contract.audit+${stamp}@example.com`,
      clientPhone: "+15550007777",
      address: "700 Contract Way, Austin, TX 73301",
      services: [
        { id: "base", name: "Contract scope", qty: 1, unitPrice: 2200, price: 2200 },
      ],
      subtotal: 2200,
      tax: 0,
      total: 2200,
      status: "draft",
      notes: `Contract audit ${stamp}`,
      clientUuid: clientId,
    },
  });
  expect(estRes.ok()).toBeTruthy();
  const estimate = (await estRes.json())?.data;
  expect(estimate?.id).toBeTruthy();
  return { clientName, clientId, estimate };
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

function getContractCard(page, marker) {
  return page.getByTestId("contract-card").filter({ hasText: marker }).first();
}

test.describe("Contracts module audit", () => {
  test.describe.configure({ timeout: 60_000 });

  test.describe("Contract library (/contracts)", () => {
    test.beforeEach(async ({ page }) => {
      await devLogin(page, { profile: "admin", redirect: "/contracts" });
      await expect(page.getByRole("heading", { name: /^Contracts$/i })).toBeVisible({
        timeout: 15_000,
      });
    });

    for (const viewport of VIEWPORTS) {
      test(`layout: ${viewport.name} — search, status filter, CTA`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(page.getByLabel(/Search contracts/i)).toBeVisible();
        await expect(page.getByLabel(/Filter by status/i)).toBeVisible();
        await expect(
          page.getByRole("link", { name: /Create from estimate/i }),
        ).toBeVisible();
      });
    }

    test("lists contract after generate — search, PDF, browser print", async ({
      page,
    }) => {
      const stamp = Date.now();
      const category = `Roofing ${stamp}`;
      const { clientName, estimate } = await createClientAndEstimate(
        page.request,
        stamp,
      );

      const contractRes = await page.request.post(
        `${ORIGIN}/api/estimates/${estimate.id}/contract`,
        {
          headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
          data: {
            category,
            option: "Standard",
            language: "en",
            persist: true,
          },
        },
      );
      expect(contractRes.ok(), await contractRes.text()).toBeTruthy();
      const contractId = (await contractRes.json())?.data?.contract?.id;
      expect(contractId).toBeTruthy();

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByLabel(/Search contracts/i).fill(clientName);
      const card = getContractCard(page, clientName);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText(new RegExp(category, "i")).first()).toBeVisible();
      await expect(
        card.getByRole("link", { name: /Print contract document/i }),
      ).toBeVisible();
      await expect(card.getByRole("link", { name: /Download PDF/i })).toBeVisible();
      await expect(
        card.getByRole("button", { name: /Print \(browser\)/i }),
      ).toBeVisible();

      const pdfRes = await page.request.get(
        `${ORIGIN}/api/contracts/${contractId}/pdf`,
        { headers: ORIGIN_HEADERS },
      );
      expect(pdfRes.ok()).toBeTruthy();
      expect(pdfRes.headers()["content-type"] || "").toMatch(/pdf/i);
    });

    test("status filter narrows visible contracts", async ({ page }) => {
      const stamp = Date.now();
      const { clientName, estimate } = await createClientAndEstimate(
        page.request,
        stamp,
      );
      const contractRes = await page.request.post(
        `${ORIGIN}/api/estimates/${estimate.id}/contract`,
        {
          headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
          data: { category: "FilterTest", language: "en", persist: true },
        },
      );
      expect(contractRes.ok()).toBeTruthy();
      const contractId = (await contractRes.json())?.data?.contract?.id;
      expect(contractId).toBeTruthy();

      const patchRes = await page.request.patch(
        `${ORIGIN}/api/contracts/${contractId}`,
        {
          headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
          data: { status: "Signed" },
        },
      );
      expect(patchRes.ok()).toBeTruthy();

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByLabel(/Search contracts/i).fill(clientName);
      await page.getByLabel(/Filter by status/i).selectOption("Signed");
      await expect(getContractCard(page, clientName)).toBeVisible({ timeout: 15_000 });

      await page.getByLabel(/Filter by status/i).selectOption("Draft");
      await expect(page.getByText(/No contracts match/i)).toBeVisible({
        timeout: 10_000,
      });
    });

    test("?clientId= filter and clear", async ({ page }) => {
      const stamp = Date.now();
      const { clientName, clientId, estimate } = await createClientAndEstimate(
        page.request,
        stamp,
      );
      await page.request.post(`${ORIGIN}/api/estimates/${estimate.id}/contract`, {
        headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
        data: { category: "ClientFilter", language: "en", persist: true },
      });

      await page.goto(`/contracts?clientId=${clientId}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByText(/selected client only/i)).toBeVisible();
      await expect(getContractCard(page, clientName)).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /Show all contracts/i }).click();
      await expect(page).toHaveURL(/\/contracts$/);
      await page.getByLabel(/Search contracts/i).fill(clientName);
      await expect(getContractCard(page, clientName)).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe("Estimate kanban integration", () => {
    test("generate contract from estimate drawer — PDF actions persist", async ({
      page,
    }) => {
      const stamp = Date.now();
      const clientName = `Kanban Contract ${stamp}`;
      await devLogin(page, { profile: "admin", redirect: "/estimates" });
      await createClientAndEstimate(page.request, stamp, { clientName });
      await openKanbanEstimate(page, clientName);

      await page.getByRole("button", { name: /Generate contract/i }).click();
      await page.getByLabel("Contract language").selectOption("en");
      await page.getByRole("button", { name: /Save contract/i }).click();
      await expect(page.getByText(/Contract saved/i)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /Print contract/i })).toBeVisible();
      await expect(
        page.getByRole("link", { name: /View all contracts/i }),
      ).toBeVisible();

      await page.goto("/contracts", { waitUntil: "domcontentloaded" });
      await page.getByLabel(/Search contracts/i).fill(clientName);
      await expect(getContractCard(page, clientName)).toBeVisible({ timeout: 15_000 });
    });
  });

  test("GET /api/contracts returns tenant rows", async ({ page }) => {
    await devLogin(page, { profile: "admin" });
    const stamp = Date.now();
    const { estimate } = await createClientAndEstimate(page.request, stamp);
    await page.request.post(`${ORIGIN}/api/estimates/${estimate.id}/contract`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: { category: "APIList", language: "en", persist: true },
    });

    const listRes = await page.request.get(`${ORIGIN}/api/contracts`, {
      headers: ORIGIN_HEADERS,
    });
    expect(listRes.ok()).toBeTruthy();
    const rows = await listRes.json();
    expect(Array.isArray(rows)).toBeTruthy();
    expect(rows.some((row) => String(row.contractCategory || "") === "APIList")).toBe(
      true,
    );
  });
});
