/**
 * Jobs / Work Orders module — contractor usability audit.
 * Run: npx playwright test tests/e2e/audit/jobs-module.spec.js
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

function getJobCard(page, title) {
  return page.getByTestId("job-card").filter({
    has: page.locator("h3", { hasText: title }),
  }).first();
}

async function createClient(api, stamp) {
  const clientName = `Job Audit Client ${stamp}`;
  const clientRes = await api.post(`${ORIGIN}/api/clients`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      name: clientName,
      email: `job.audit+${stamp}@example.com`,
      phone: "+15550005555",
      address: "500 Job Lane",
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

test.describe("Jobs module audit", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/jobs" });
    await expect(page.getByRole("heading", { name: /^Jobs$/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`layout: ${viewport.name} — form and list search`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByPlaceholder("Title", { exact: true })).toBeVisible();
      await expect(page.getByLabel(/Search jobs/i)).toBeVisible();
      await expect(page.getByRole("heading", { name: /Job list/i })).toBeVisible();
    });
  }

  test("create job, search, print work order PDF, persist after refresh", async ({
    page,
  }) => {
    const stamp = Date.now();
    const title = `Job Audit ${stamp}`;
    const clientName = `Job Client ${stamp}`;

    await page.getByPlaceholder("Title", { exact: true }).fill(title);
    await page.getByPlaceholder("Client", { exact: true }).fill(clientName);
    await page.getByPlaceholder("Price", { exact: true }).fill("1200");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search jobs/i).fill(title);
    const card = getJobCard(page, title);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(
      card.getByRole("link", { name: /Print work order document/i }),
    ).toBeVisible();
    await expect(card.getByRole("link", { name: /Download PDF/i })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel(/Search jobs/i).fill(title);
    await expect(getJobCard(page, title)).toBeVisible({ timeout: 15_000 });
  });

  test("edit job — update status and title, persists after reload", async ({
    page,
  }) => {
    const stamp = Date.now();
    const title = `Job Edit ${stamp}`;
    const updatedTitle = `${title} Updated`;

    await page.getByPlaceholder("Title", { exact: true }).fill(title);
    await page.getByPlaceholder("Client", { exact: true }).fill(`Edit Client ${stamp}`);
    await page.getByPlaceholder("Price", { exact: true }).fill("900");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search jobs/i).fill(title);
    const card = getJobCard(page, title);
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole("button", { name: /^Edit$/i }).click();
    await expect(page.getByRole("heading", { name: /Edit job/i })).toBeVisible();
    await page.getByPlaceholder("Title", { exact: true }).fill(updatedTitle);
    await page.getByLabel(/^Status$/i).selectOption("In progress");
    await page.getByRole("button", { name: /^Update$/i }).click();

    await expect(page.getByRole("heading", { name: /New job/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByLabel(/Search jobs/i).fill(updatedTitle);
    const updatedCard = getJobCard(page, updatedTitle);
    await expect(updatedCard).toBeVisible({ timeout: 15_000 });
    await expect(updatedCard.getByText(/In progress/i)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel(/Search jobs/i).fill(updatedTitle);
    await expect(getJobCard(page, updatedTitle)).toBeVisible({ timeout: 15_000 });
  });

  test("search filters by status keyword", async ({ page }) => {
    const stamp = Date.now();
    const title = `Job Status ${stamp}`;

    await page.getByPlaceholder("Title", { exact: true }).fill(title);
    await page.getByPlaceholder("Client", { exact: true }).fill(`Status Client ${stamp}`);
    await page.getByPlaceholder("Price", { exact: true }).fill("500");
    await page.getByLabel(/^Status$/i).selectOption("Completed");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search jobs/i).fill("Completed");
    await expect(getJobCard(page, title)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/Search jobs/i).fill(`NoMatchXYZ ${stamp}`);
    await expect(page.getByText(/No jobs match your search/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("?clientId= filter and clear client filter", async ({ page }) => {
    const stamp = Date.now();
    const { clientName, clientId } = await createClient(page.request, stamp);
    const title = `Job ClientFilter ${stamp}`;

    const jobRes = await page.request.post(`${ORIGIN}/api/jobs`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        title,
        clientName,
        clientId,
        service: "Filter test",
        status: "Pending",
        price: 750,
      },
    });
    expect(jobRes.ok()).toBeTruthy();

    await page.goto(`/jobs?clientId=${clientId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Jobs$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/Showing jobs for the selected client only/i),
    ).toBeVisible();
    await expect(getJobCard(page, title)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Clear client filter/i }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await page.getByLabel(/Search jobs/i).fill(title);
    await expect(getJobCard(page, title)).toBeVisible({ timeout: 15_000 });
  });

  test("work order PDF API returns application/pdf", async ({ page }) => {
    const stamp = Date.now();
    const jobRes = await page.request.post(`${ORIGIN}/api/jobs`, {
      headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
      data: {
        title: `Job PDF ${stamp}`,
        clientName: "PDF Client",
        service: "PDF test",
        status: "Pending",
        price: 400,
      },
    });
    expect(jobRes.ok()).toBeTruthy();
    const jobId = (await jobRes.json())?.data?._id;
    expect(jobId).toBeTruthy();

    const pdfRes = await page.request.get(`${ORIGIN}/api/jobs/${jobId}/pdf`, {
      headers: ORIGIN_HEADERS,
    });
    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()["content-type"] || "").toMatch(/pdf/i);

    const downloadRes = await page.request.get(
      `${ORIGIN}/api/jobs/${jobId}/pdf?download=1`,
      { headers: ORIGIN_HEADERS },
    );
    expect(downloadRes.ok()).toBeTruthy();
  });

  test("manage files panel opens and closes", async ({ page }) => {
    const stamp = Date.now();
    const title = `Job Files Panel ${stamp}`;

    await page.getByPlaceholder("Title", { exact: true }).fill(title);
    await page.getByPlaceholder("Client", { exact: true }).fill(`Files ${stamp}`);
    await page.getByPlaceholder("Price", { exact: true }).fill("300");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search jobs/i).fill(title);
    const card = getJobCard(page, title);
    await expect(card).toBeVisible({ timeout: 15_000 });

    const panel = card.getByTestId("job-files-panel");
    await card.getByRole("button", { name: /Manage files/i }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: /Upload Photos/i })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Upload Documents/i })).toBeVisible();

    await card.getByRole("button", { name: /Hide files/i }).click();
    await expect(panel).toHaveCount(0);
  });

  test("clear form resets edit mode", async ({ page }) => {
    const stamp = Date.now();
    const title = `Job Clear ${stamp}`;

    await page.getByPlaceholder("Title", { exact: true }).fill(title);
    await page.getByPlaceholder("Client", { exact: true }).fill(`Clear ${stamp}`);
    await page.getByPlaceholder("Price", { exact: true }).fill("200");
    await page.getByRole("button", { name: /^Save$/i }).click();

    await page.getByLabel(/Search jobs/i).fill(title);
    await getJobCard(page, title).getByRole("button", { name: /^Edit$/i }).click();
    await expect(page.getByRole("heading", { name: /Edit job/i })).toBeVisible();

    await page.getByRole("button", { name: /^Clear$/i }).click();
    await expect(page.getByRole("heading", { name: /New job/i })).toBeVisible();
    await expect(page.getByPlaceholder("Title", { exact: true })).toHaveValue("");
  });
});
