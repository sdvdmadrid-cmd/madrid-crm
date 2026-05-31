/**
 * Payments module — contractor client payments audit.
 * Covers Stripe Connect settings, manual/partial payments, invoice linkage, and UI.
 * Run: npx playwright test tests/e2e/audit/payments-module.spec.js
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

const todayIso = () => new Date().toISOString().slice(0, 10);

function getInvoiceCard(page, marker) {
  return page.getByTestId("invoice-card").filter({ hasText: marker }).first();
}

async function createInvoice(api, stamp, overrides = {}) {
  const clientName = overrides.clientName || `Payments Client ${stamp}`;
  const res = await api.post(`${ORIGIN}/api/invoices`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: {
      clientName,
      clientEmail: overrides.email || `pay.audit+${stamp}@example.com`,
      invoiceTitle: overrides.title || `Payment audit ${stamp}`,
      amount: overrides.amount || "500",
      dueDate: overrides.dueDate || "2026-12-20",
      status: "Unpaid",
      ...overrides.extra,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const invoice = (await res.json())?.data;
  expect(invoice?._id || invoice?.id).toBeTruthy();
  return { clientName, invoice };
}

async function registerPayment(api, invoiceId, payload) {
  return api.post(`${ORIGIN}/api/invoices/${invoiceId}/payments`, {
    headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
    data: payload,
  });
}

async function reloadInvoicesList(page) {
  await page.goto("/invoices", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^Invoices$/i })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Payments module audit", () => {
  test.describe.configure({ timeout: 60_000 });

  test.describe("Stripe Connect settings (/settings/payments)", () => {
    test.beforeEach(async ({ page }) => {
      await devLogin(page, { profile: "admin", redirect: "/settings/payments" });
      await expect(
        page.getByRole("heading", { name: /Client payments/i }),
      ).toBeVisible({ timeout: 15_000 });
    });

    for (const viewport of VIEWPORTS) {
      test(`layout: ${viewport.name} — hero, status, and how-it-works`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(page.getByText(/Stripe payout account/i)).toBeVisible();
        await expect(page.getByRole("heading", { name: /How it works/i })).toBeVisible();
        await expect(page.getByRole("heading", { name: /Account status/i })).toBeVisible();
        await expect(
          page.getByRole("link", { name: /All settings/i }),
        ).toBeVisible();
      });
    }

    test("connect status API returns contractor payment configuration", async ({
      page,
    }) => {
      const res = await page.request.get(`${ORIGIN}/api/payments/connect/status`, {
        headers: ORIGIN_HEADERS,
      });
      expect(res.ok()).toBeTruthy();
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toMatchObject({
        enabled: expect.any(Boolean),
        configured: expect.any(Boolean),
        onboarded: expect.any(Boolean),
      });
    });

    test("connect return query shows refreshed notice", async ({ page }) => {
      await page.goto("/settings/payments?connect=return", {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByText(/refreshed your payout status/i),
      ).toBeVisible({ timeout: 15_000 });
    });

    test("primary action visible when not yet connected", async ({ page }) => {
      const statusRes = await page.request.get(
        `${ORIGIN}/api/payments/connect/status`,
        { headers: ORIGIN_HEADERS },
      );
      const status = (await statusRes.json())?.data;
      if (!status?.enabled) {
        await expect(page.getByText(/Finish payout setup/i)).toBeVisible();
        return;
      }
      if (!status?.onboarded) {
        await expect(
          page.getByRole("button", {
            name: /Connect with Stripe|Continue Stripe setup/i,
          }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("button", { name: /Open Stripe dashboard/i }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: /Go to invoices/i }),
        ).toBeVisible();
      }
    });
  });

  test.describe("Manual invoice payments (API + invoice UI)", () => {
    test.beforeEach(async ({ page }) => {
      await devLogin(page, { profile: "admin", redirect: "/invoices" });
      await expect(page.getByRole("heading", { name: /^Invoices$/i })).toBeVisible({
        timeout: 15_000,
      });
    });

    test("record full cash payment — invoice status Paid", async ({ page }) => {
      const stamp = Date.now();
      const { clientName, invoice } = await createInvoice(page.request, stamp, {
        amount: "300",
      });
      const invId = invoice._id || invoice.id;

      const payRes = await registerPayment(page.request, invId, {
        amount: "300",
        method: "cash",
        date: todayIso(),
        notes: "Paid in full on site",
      });
      expect(payRes.ok(), await payRes.text()).toBeTruthy();
      const updated = (await payRes.json())?.data;
      expect(updated?.status).toBe("Paid");
      expect(Number(updated?.balanceDue || 0)).toBe(0);

      await reloadInvoicesList(page);
      await page.getByLabel(/Search invoices/i).fill(clientName);
      const card = getInvoiceCard(page, clientName);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText(/Paid/i).first()).toBeVisible();
      await expect(card.getByText(/Amount: \$300/)).toBeVisible();
    });

    test("record two partial payments — Partial status and payment history", async ({
      page,
    }) => {
      const stamp = Date.now();
      const { clientName, invoice } = await createInvoice(page.request, stamp, {
        amount: "600",
      });
      const invId = invoice._id || invoice.id;

      const first = await registerPayment(page.request, invId, {
        amount: "200",
        method: "cash",
        date: todayIso(),
        notes: "Deposit",
      });
      expect(first.ok()).toBeTruthy();
      let row = (await first.json())?.data;
      expect(row?.status).toBe("Partial");
      expect(Number(row?.paidAmount)).toBe(200);
      expect(Number(row?.balanceDue)).toBe(400);

      const second = await registerPayment(page.request, invId, {
        amount: "150",
        method: "check",
        date: todayIso(),
        reference: `CHK-${stamp}`,
        notes: "Progress draw",
      });
      expect(second.ok()).toBeTruthy();
      row = (await second.json())?.data;
      expect(row?.status).toBe("Partial");
      expect(Number(row?.paidAmount)).toBe(350);
      expect(Number(row?.balanceDue)).toBe(250);
      expect(row?.payments?.length).toBeGreaterThanOrEqual(2);

      await reloadInvoicesList(page);
      await page.getByLabel(/Search invoices/i).fill(clientName);
      const card = getInvoiceCard(page, clientName);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText(/Partial/i).first()).toBeVisible();
      await expect(card.getByText(/Paid: \$350\.00/)).toBeVisible();
      await expect(card.getByText(/Balance: \$250\.00/)).toBeVisible();
      await expect(card.getByText(/\(Cash\)/)).toBeVisible();
      await expect(card.getByText(/\(Check\)/)).toBeVisible();
    });

    test("reject payment over balance", async ({ page }) => {
      const stamp = Date.now();
      const { invoice } = await createInvoice(page.request, stamp, { amount: "100" });
      const invId = invoice._id || invoice.id;

      const payRes = await registerPayment(page.request, invId, {
        amount: "150",
        method: "cash",
        date: todayIso(),
        notes: "Overpay attempt",
      });
      expect(payRes.status()).toBe(400);
      const body = await payRes.json();
      expect(String(body.error || "")).toMatch(/exceeds|balance/i);
    });

    test("reject Zelle without reference", async ({ page }) => {
      const stamp = Date.now();
      const { invoice } = await createInvoice(page.request, stamp);
      const invId = invoice._id || invoice.id;

      const payRes = await registerPayment(page.request, invId, {
        amount: "50",
        method: "zelle",
        date: todayIso(),
        reference: "",
        notes: "",
      });
      expect(payRes.status()).toBe(400);
      expect(String((await payRes.json())?.error || "")).toMatch(/reference/i);
    });

    test("UI register payment panel — second partial on invoice card", async ({
      page,
    }) => {
      const stamp = Date.now();
      const { clientName, invoice } = await createInvoice(page.request, stamp, {
        amount: "400",
      });
      const invId = invoice._id || invoice.id;

      await registerPayment(page.request, invId, {
        amount: "100",
        method: "cash",
        date: todayIso(),
        notes: "First draw",
      });

      await reloadInvoicesList(page);
      await page.getByLabel(/Search invoices/i).fill(clientName);
      const card = getInvoiceCard(page, clientName);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.getByRole("button", { name: /^Register payment$/i }).click();
      await card.locator("select").selectOption("cash");
      await card.getByPlaceholder("Amount", { exact: true }).fill("50");
      await card.getByPlaceholder("Notes", { exact: true }).fill("Second draw UI");
      await card.getByRole("button", { name: /Save payment/i }).click();

      await expect(card.getByText(/Partial/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText(/Paid: \$150\.00/)).toBeVisible();
      await expect(card.getByText(/Balance: \$250\.00/)).toBeVisible();
    });

    test("partial invoice shows Partial status on card after list refresh", async ({
      page,
    }) => {
      const stamp = Date.now();
      const { clientName, invoice } = await createInvoice(page.request, stamp);
      const invId = invoice._id || invoice.id;
      await registerPayment(page.request, invId, {
        amount: "25",
        method: "cash",
        date: todayIso(),
        notes: "Partial seed",
      });

      await reloadInvoicesList(page);
      await page.getByLabel(/Search invoices/i).fill(clientName);
      const card = getInvoiceCard(page, clientName);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText(/Partial/i).first()).toBeVisible();
    });
  });

  test.describe("Stripe checkout integration", () => {
    test.beforeEach(async ({ page }) => {
      await devLogin(page, { profile: "admin" });
    });

    test("checkout API creates session or returns actionable configuration error", async ({
      page,
    }) => {
      const stamp = Date.now();
      const { invoice } = await createInvoice(page.request, stamp, { amount: "75" });
      const invId = invoice._id || invoice.id;

      const checkoutRes = await page.request.post(
        `${ORIGIN}/api/invoices/${invId}/checkout`,
        {
          headers: { ...ORIGIN_HEADERS, "Content-Type": "application/json" },
          data: {},
        },
      );

      const body = await checkoutRes.json().catch(() => ({}));
      if (checkoutRes.ok()) {
        expect(body.success).toBe(true);
        expect(String(body?.data?.checkoutUrl || "")).toMatch(/^https?:\/\//);
        expect(body?.data?.sessionId).toBeTruthy();
      } else {
        expect(checkoutRes.status()).toBeGreaterThanOrEqual(400);
        const err = String(body.error || body.message || "");
        expect(err.length).toBeGreaterThan(0);
      }
    });

    test("client return URLs show payment success and cancel notices", async ({
      page,
    }) => {
      await page.goto("/invoices?payment=success", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByText(/Payment received/i),
      ).toBeVisible({ timeout: 15_000 });

      await page.goto("/invoices?payment=cancel", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Checkout cancelled/i)).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe("Contractor visibility & navigation", () => {
    test("dashboard surfaces payments readiness banner", async ({ page }) => {
      await devLogin(page, { profile: "admin", redirect: "/dashboard" });
      await expect(page.getByRole("heading", { name: /Command Center/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole("link", { name: /Collect payment/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByText(/Connect payouts|Turn on card payments|Your payout account is active/i).first(),
      ).toBeVisible();
    });

    test("invoices page shows get-paid guide for contractors", async ({ page }) => {
      await devLogin(page, { profile: "admin", redirect: "/invoices" });
      await expect(
        page.getByRole("heading", { name: /Get paid online by your clients/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: /^Register payment$/i }).first(),
      ).toBeVisible();
    });

    test("settings hub links to client payments", async ({ page }) => {
      await devLogin(page, { profile: "admin", redirect: "/settings" });
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("link", { name: /Open payments/i }).click();
      await expect(page).toHaveURL(/\/settings\/payments/, { timeout: 10_000 });
      await expect(
        page.getByRole("heading", { name: /Client payments/i }),
      ).toBeVisible();
    });
  });
});
