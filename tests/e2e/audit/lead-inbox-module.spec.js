/**
 * Lead Inbox module — contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/lead-inbox-module.spec.js
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

async function seedLead(api, stamp, overrides = {}) {
  const name = overrides.name || `Lead Audit ${stamp}`;
  const res = await api.post(`${ORIGIN}/api/lead-inbox/leads`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      name,
      email: overrides.email || `lead.audit+${stamp}@example.com`,
      phone: "+15550009999",
      description: overrides.description || `Audit lead message ${stamp}`,
      serviceNeeded: overrides.serviceNeeded || "Gutter cleaning",
      status: overrides.status || "new",
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const id = (await res.json())?.data?.id;
  expect(id).toBeTruthy();
  return { name, id };
}

function getLeadCard(page, marker) {
  return page.getByTestId("lead-card").filter({ hasText: marker }).first();
}

test.describe("Lead Inbox module audit", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/lead-inbox" });
    await expect(page.getByRole("heading", { name: /Lead Inbox/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`layout: ${viewport.name} — search, filters, refresh`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByLabel(/Search leads/i)).toBeVisible();
      await expect(page.getByLabel(/Filter by source/i)).toBeVisible();
      await expect(page.getByLabel(/Filter by status/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /Refresh/i })).toBeVisible();
    });
  }

  test("seeded lead — search, status update, source filter", async ({ page }) => {
    const stamp = Date.now();
    const { name } = await seedLead(page.request, stamp);

    await page.getByRole("button", { name: /Refresh/i }).click();
    await page.getByLabel(/Search leads/i).fill(name);
    const card = getLeadCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByRole("link", { name: /Call/i })).toBeVisible();
    await expect(card.getByRole("link", { name: /Email/i })).toBeVisible();

    await card.getByLabel(/^Status$/i).selectOption("contacted");
    await expect(page.getByText(/Lead status updated/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel(/Search leads/i).fill(name);
    await page.getByLabel(/Filter by source/i).selectOption("Website leads");
    await expect(getLeadCard(page, name)).toBeVisible({ timeout: 10_000 });

    await page.getByLabel(/Filter by status/i).selectOption("new");
    await expect(page.getByText(/No leads match your search or filters/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("convert to estimate opens editor", async ({ page }) => {
    const stamp = Date.now();
    const { name } = await seedLead(page.request, stamp);

    await page.getByRole("button", { name: /Refresh/i }).click();
    await page.getByLabel(/Search leads/i).fill(name);
    const card = getLeadCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: /Convert to Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new\?edit=/, { timeout: 25_000 });

    await page.goto("/lead-inbox", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/Search leads/i).fill(name);
    await expect(getLeadCard(page, name)).toHaveCount(0, { timeout: 15_000 });
  });

  test("GET /api/lead-inbox returns merged queue", async ({ page }) => {
    const stamp = Date.now();
    await seedLead(page.request, stamp, { serviceNeeded: "APIListCheck" });

    const listRes = await page.request.get(`${ORIGIN}/api/lead-inbox`, {
      headers: ORIGIN_HEADERS,
    });
    expect(listRes.ok()).toBeTruthy();
    const json = await listRes.json();
    const rows = json?.data || [];
    expect(Array.isArray(rows)).toBeTruthy();
    expect(
      rows.some((row) => String(row.serviceNeeded || "") === "APIListCheck"),
    ).toBe(true);
  });
});
