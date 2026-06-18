/**
 * Contractor usability audit — exercises real UI workflows (not just API/build).
 * Run: npx playwright test tests/e2e/contractor-usability.spec.js
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("./helpers/auth");

const ORIGIN = "http://localhost:3000";
const ORIGIN_HEADERS = { Origin: ORIGIN };

test.describe("Contractor usability — core CRM workflows", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
  });

  test("dashboard quick actions navigate to working modules", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Command Center/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "New Estimate", exact: true }).click();
    await expect(page).toHaveURL(/\/estimates\/new/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /New Estimate/i })).toBeVisible();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Add Client", exact: true }).click();
    await expect(page).toHaveURL(/\/clients/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Clients$/i })).toBeVisible();
  });

  test("clients: create, search, open profile, start estimate from search", async ({
    page,
  }) => {
    const stamp = Date.now();
    const clientName = `UX Audit Client ${stamp}`;
    const clientEmail = `ux.audit+${stamp}@example.com`;

    await page.goto("/clients", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Clients$/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("clients-new-button").click();
    await page.getByRole("textbox", { name: /Name/i }).fill(clientName);
    await page.getByRole("textbox", { name: /Email/i }).fill(clientEmail);
    await page.getByRole("textbox", { name: /Phone/i }).fill("+15550009999");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await expect(page.getByRole("heading", { name: clientName, level: 3 })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("clients-search").fill(clientName);
    const card = page.locator("article.cf-client-card").filter({
      has: page.getByRole("heading", { name: clientName, level: 3 }),
    });
    await card.getByRole("button", { name: /Client actions/i }).click();
    await page.getByRole("menuitem", { name: /New estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new\?clientId=/, { timeout: 15_000 });

    await page.goto("/clients", { waitUntil: "domcontentloaded" });
    await page.getByTestId("clients-search").fill(clientName);
    await page
      .locator("article.cf-client-card")
      .filter({ has: page.getByRole("heading", { name: clientName, level: 3 }) })
      .click();
    await expect(page.getByRole("heading", { name: clientName, level: 2 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /Create estimate/i })).toBeVisible();
  });

  test("estimates: create draft via UI, find in kanban search, edit persists", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const stamp = Date.now();
    const clientName = `UX Est Client ${stamp}`;

    const api = page.request;
    const clientRes = await api.post("/api/clients", {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        name: clientName,
        email: `ux.est+${stamp}@example.com`,
        phone: "+15550008888",
        address: "100 Audit Lane",
        city: "Austin",
        state: "TX",
        zip: "73301",
      },
    });
    expect(clientRes.ok()).toBeTruthy();
    const clientJson = await clientRes.json();
    const clientId = clientJson?.data?.id;
    expect(clientId).toBeTruthy();

    await page.goto(`/estimates/new?clientId=${encodeURIComponent(clientId)}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByLabel("Client first name")).toHaveValue(/UX/, {
      timeout: 15_000,
    });

    const lineRow = page.getByTestId("estimate-line-item-row").first();
    await lineRow.getByTestId("estimate-line-item-description").fill("Services");
    await lineRow.locator('input[type="number"]').nth(1).fill("1500");
    await page.getByRole("button", { name: /Save as draft/i }).click();

    await expect(page).toHaveURL(/\/estimates\/new\?edit=/, { timeout: 20_000 });

    await page.goto("/estimates", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Search estimates").fill(clientName);
    await page.getByLabel("Hide test data").uncheck();

    await expect(
      page.getByRole("button", { name: new RegExp(clientName) }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: new RegExp(clientName) }).click();
    await page.getByText("More actions").click();
    await expect(page.getByRole("button", { name: /Edit estimate/i })).toBeVisible();

    await page.getByRole("button", { name: /Edit estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates\/new\?edit=/, { timeout: 15_000 });
    await expect(page.getByText(/Loading estimate/i)).toBeHidden({ timeout: 15_000 });

    const scopeNote = `UX scope note ${stamp}`;
    await page.getByTestId("estimate-job-description").fill(scopeNote);
    const patchDone = page.waitForResponse(
      (resp) =>
        resp.request().method() === "PATCH" &&
        /\/api\/estimates\/\d+/.test(resp.url()) &&
        resp.ok(),
    );
    await page.getByRole("button", { name: /Save as draft/i }).click();
    await patchDone;
    await expect(page.getByText(/Estimate saved/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("estimate-job-description")).toHaveValue(scopeNote, {
      timeout: 10_000,
    });

    await page.goto("/estimates", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Search estimates").fill(clientName);
    await page.getByLabel("Hide test data").uncheck();
    const detailFetch = page.waitForResponse(
      (resp) =>
        resp.request().method() === "GET" &&
        /\/api\/estimates\/\d+/.test(resp.url()) &&
        resp.ok(),
    );
    await page.getByRole("button", { name: new RegExp(clientName) }).click();
    await detailFetch;
    await expect(page.getByText("Job description")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(scopeNote)).toBeVisible({ timeout: 15_000 });
  });

  test("estimates kanban: status filter and clientId URL scope", async ({ page }) => {
    await page.goto("/estimates", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Hide test data").uncheck();
    await page.getByLabel("Filter by status").selectOption("draft");
    await expect(page.getByText(/shown/i)).toBeVisible({ timeout: 10_000 });

    const api = page.request;
    const clientsRes = await api.get("/api/clients", { headers: ORIGIN_HEADERS });
    const clients = await clientsRes.json();
    const first = Array.isArray(clients) ? clients[0] : clients?.data?.[0];
    test.skip(!first?.id, "No clients in tenant");

    await page.goto(`/estimates?clientId=${encodeURIComponent(first.id)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/filtered by client/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Clear client filter/i }).click();
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 10_000 });
  });

  test("jobs: list search filters visible cards", async ({ page }) => {
    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    const search = page.getByLabel(/Search jobs/i);
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill("zzzz-no-match-ux-audit");
    await expect(page.getByText(/No jobs match/i)).toBeVisible({ timeout: 10_000 });
  });

  test("invoices: list search and client filter clear", async ({ page }) => {
    await page.goto("/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel(/Search invoices/i)).toBeVisible({ timeout: 15_000 });

    const api = page.request;
    const clientsRes = await api.get("/api/clients", { headers: ORIGIN_HEADERS });
    const clients = await clientsRes.json();
    const first = Array.isArray(clients) ? clients[0] : clients?.data?.[0];
    test.skip(!first?.id, "No clients in tenant");

    await page.goto(`/invoices?clientId=${encodeURIComponent(first.id)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/selected client only/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Show all/i }).click();
    await expect(page).toHaveURL(/\/invoices$/, { timeout: 10_000 });
  });

  test("service catalog: create service appears in list and survives edit", async ({
    page,
  }) => {
    const stamp = Date.now();
    const name = `UX Catalog Service ${stamp}`;
    const updated = `${name} Updated`;

    await page.goto("/services-catalog", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Service Catalog/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByPlaceholder("Service name").fill(name);
    await page.getByPlaceholder("Category").fill("Audit");
    await page.getByPlaceholder("Min price").fill("100");
    await page.getByPlaceholder("Max price").fill("250");
    await page.getByPlaceholder("Description").fill("Usability audit service row");
    await page.getByRole("button", { name: /^Add service$/i }).click();

    const row = page.locator("article").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole("button", { name: /^Edit$/i }).click();
    await expect(page.getByRole("heading", { name: /Edit service/i })).toBeVisible();
    await page.getByPlaceholder("Service name").fill(updated);
    await page.getByRole("button", { name: /^Update service$/i }).click();

    await expect(page.locator("article").filter({ hasText: updated })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("lead inbox, calendar, service catalog, reputation pages load with controls", async ({
    page,
  }) => {
    for (const path of [
      "/lead-inbox",
      "/calendar",
      "/services-catalog",
      "/reputation",
      "/settings",
      "/bill-payments",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    }

    await page.goto("/lead-inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Refresh/i })).toBeVisible();

    await page.goto("/calendar", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/weather/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
