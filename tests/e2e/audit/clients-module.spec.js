/**
 * Clients module — full contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/clients-module.spec.js
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

test.describe("Clients module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/clients" });
    await expect(page.getByRole("heading", { name: /^Clients$/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`layout: ${viewport.name} — form, list search, cards visible`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await expect(page.getByRole("textbox", { name: /Name/i })).toBeVisible();
      await expect(
        page.getByRole("searchbox", { name: /Search client list/i }),
      ).toBeVisible();
      await expect(page.getByRole("combobox", { name: /Search clients/i })).toBeVisible();
    });
  }

  test("create client persists after refresh and list search finds it", async ({
    page,
  }) => {
    const stamp = Date.now();
    const clientName = `Module Audit Client ${stamp}`;
    const clientEmail = `module.audit+${stamp}@example.com`;

    await page.getByRole("textbox", { name: /Name/i }).fill(clientName);
    await page.getByRole("textbox", { name: /Email/i }).fill(clientEmail);
    await page.getByRole("textbox", { name: /Phone/i }).fill("+15550001234");
    await page.getByRole("button", { name: /^(Save|Update)$/i }).click();

    await expect(page.getByRole("heading", { name: clientName, level: 3 })).toBeVisible({
      timeout: 15_000,
    });

    const listSearch = page.getByRole("searchbox", { name: /Search client list/i });
    await listSearch.fill(clientName);
    await expect(page.getByRole("heading", { name: clientName, level: 3 })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Clients$/i })).toBeVisible({
      timeout: 15_000,
    });
    await listSearch.fill(clientName);
    await expect(page.getByRole("heading", { name: clientName, level: 3 })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("edit client updates list card", async ({ page }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const original = `Edit Audit ${stamp}`;
    const updated = `${original} Updated`;

    await page.getByRole("textbox", { name: /Name/i }).fill(original);
    await page.getByRole("button", { name: /^(Save|Update)$/i }).click();
    await expect(page.getByRole("heading", { name: original, level: 3 })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("searchbox", { name: /Search client list/i }).fill(original);
    const card = page.locator("article.cf-client-card").filter({
      has: page.getByRole("heading", { name: original, level: 3 }),
    });
    await card.getByRole("button", { name: /Client actions/i }).click();
    await page.getByRole("menuitem", { name: /Edit client/i }).click();

    await page.getByRole("textbox", { name: /Name/i }).fill(updated);
    await page.getByRole("button", { name: /^(Save|Update)$/i }).click();
    await expect(page.getByRole("heading", { name: updated, level: 3 })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("details panel: quick actions and PDF endpoints", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `Details Audit ${stamp}`;
    const api = page.request;

    await page.getByRole("textbox", { name: /Name/i }).fill(clientName);
    await page.getByRole("textbox", { name: /Email/i }).fill(`details+${stamp}@example.com`);
    await page.getByRole("button", { name: /^(Save|Update)$/i }).click();
    await expect(page.getByRole("heading", { name: clientName, level: 3 })).toBeVisible({
      timeout: 15_000,
    });

    const combobox = page.getByRole("combobox", { name: /Search clients/i });
    await combobox.fill(clientName);
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: new RegExp(clientName) }).click();

    await expect(page.getByRole("heading", { name: clientName, level: 2 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /New estimate/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Print record|Print record document/i }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Download PDF/i }).first()).toBeVisible();

    const estimateHref = await page
      .getByRole("link", { name: /New estimate/i })
      .first()
      .getAttribute("href");
    const clientId = new URL(estimateHref || "", ORIGIN).searchParams.get("clientId");
    expect(clientId).toBeTruthy();

    const pdfRes = await api.get(`${ORIGIN}/api/clients/${clientId}/pdf`, {
      headers: ORIGIN_HEADERS,
    });
    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()["content-type"] || "").toMatch(/pdf/i);

    const downloadRes = await api.get(
      `${ORIGIN}/api/clients/${clientId}/pdf?download=1`,
      { headers: ORIGIN_HEADERS },
    );
    expect(downloadRes.ok()).toBeTruthy();
    const disposition = downloadRes.headers()["content-disposition"] || "";
    expect(disposition.toLowerCase()).toContain("attachment");
  });

  test("autocomplete routes new estimate with clientId", async ({ page }) => {
    const stamp = Date.now();
    const clientName = `Estimate Route ${stamp}`;

    await page.getByRole("textbox", { name: /Name/i }).fill(clientName);
    await page.getByRole("button", { name: /^(Save|Update)$/i }).click();
    await expect(page.getByRole("heading", { name: clientName, level: 3 })).toBeVisible({
      timeout: 15_000,
    });

    const combobox = page.getByRole("combobox", { name: /Search clients/i });
    await combobox.fill(clientName);
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /New estimate/i }).first().click();
    await expect(page).toHaveURL(/\/estimates\/new\?clientId=/, { timeout: 15_000 });
  });
});
