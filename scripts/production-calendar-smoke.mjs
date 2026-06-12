#!/usr/bin/env node
/**
 * Production calendar smoke — create +1 and +12 month appointments, refresh, nav.
 * Usage: node scripts/production-calendar-smoke.mjs
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = (
  process.env.APP_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "https://fieldbaseapp.net"
).replace(/\/$/, "");

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

function ymdFromParts(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function futureDate(monthsAhead, dayOffset = 0) {
  const base = new Date();
  const day = Math.min(28, 12 + monthsAhead * 3 + dayOffset);
  const d = new Date(base.getFullYear(), base.getMonth() + monthsAhead, day);
  if (d <= base) d.setDate(base.getDate() + 1);
  return ymdFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}

async function login(page) {
  const email =
    process.env.PROD_SMOKE_EMAIL ||
    process.env.DEV_ADMIN_EMAIL ||
    "admin@fieldbase.local";
  const password =
    process.env.PROD_SMOKE_PASSWORD ||
    process.env.DEV_ADMIN_PASSWORD ||
    "";

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  const loginRes = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  const res = await loginRes;
  if (!res.ok()) {
    throw new Error(`Login failed (${res.status()}) for ${email}`);
  }
  await page.waitForURL(/\/(dashboard|calendar)/, { timeout: 30_000 });
}

async function expectCalendarLoaded(page) {
  await expectVisible(page.getByTestId("calendar-shell"), 20_000);
  await expectVisible(page.getByTestId("calendar-forecast-strip"), 15_000);
}

async function expectVisible(locator, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.isVisible().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Element not visible within ${timeout}ms`);
}

async function saveMinimalAppointment(page, { title, dateYmd }) {
  await page.getByTestId("appointment-title-input").fill(title);
  await page.getByPlaceholder("Client", { exact: true }).fill("Prod Smoke Client");
  await page.getByTestId("appointment-date-input").fill(dateYmd);
  await page.locator('input[type="time"]').first().fill("09:30");
  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/appointments") && r.request().method() === "POST",
  );
  const refetchResponse = page.waitForResponse(
    (r) => r.url().includes("/api/appointments") && r.request().method() === "GET",
  );
  await page.getByTestId("appointment-save-button").click();
  const createRes = await createResponse;
  if (!createRes.ok()) throw new Error(`POST appointment failed (${createRes.status()})`);
  await refetchResponse;
}

async function expectAppointmentOnDay(page, dateYmd, title) {
  const cell = page.getByTestId(`calendar-day-${dateYmd}`);
  await expectVisible(cell, 15_000);
  const moreBtn = cell.getByRole("button", { name: /^\+\d+ more$/ });
  if (await moreBtn.isVisible().catch(() => false)) await moreBtn.click();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await cell.getByText(title).isVisible().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Appointment "${title}" not visible on ${dateYmd}`);
}

async function openDayAndSave(page, { title, dateYmd }) {
  await page.goto(`${BASE}/calendar?date=${dateYmd}`, { waitUntil: "domcontentloaded" });
  await expectCalendarLoaded(page);
  await expectVisible(page.getByTestId(`calendar-day-${dateYmd}`), 15_000);
  await page.getByTestId(`calendar-day-${dateYmd}`).click({ position: { x: 8, y: 8 } });
  await expectVisible(page.getByTestId("appointment-date-input"), 10_000);
  await saveMinimalAppointment(page, { title, dateYmd });
  await expectAppointmentOnDay(page, dateYmd, title);
}

async function main() {
  loadEnvLocal();

  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json();
  console.log(`[prod-smoke] Health commitSha=${health.commitSha}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  const stamp = Date.now();
  const results = [];

  try {
    await login(page);

    const nextMonthDate = futureDate(1, 1);
    const twelveMonthDate = futureDate(12, 2);
    const nextTitle = `Prod Smoke next ${stamp}`;
    const twelveTitle = `Prod Smoke twelve ${stamp}`;

    await openDayAndSave(page, { title: nextTitle, dateYmd: nextMonthDate });
    results.push({ step: "create +1 month", ok: true, dateYmd: nextMonthDate });

    await openDayAndSave(page, { title: twelveTitle, dateYmd: twelveMonthDate });
    results.push({ step: "create +12 months", ok: true, dateYmd: twelveMonthDate });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.goto(`${BASE}/calendar?date=${nextMonthDate}`, { waitUntil: "domcontentloaded" });
    await expectCalendarLoaded(page);
    await expectAppointmentOnDay(page, nextMonthDate, nextTitle);
    results.push({ step: "persist +1 after refresh", ok: true });

    await page.goto(`${BASE}/calendar?date=${twelveMonthDate}`, { waitUntil: "domcontentloaded" });
    await expectCalendarLoaded(page);
    await expectAppointmentOnDay(page, twelveMonthDate, twelveTitle);
    results.push({ step: "persist +12 after refresh", ok: true });

    const heading = page.locator("header h1").first();
    const initial = (await heading.textContent())?.trim();
    await page.getByTestId("calendar-next-month").click();
    const next = (await heading.textContent())?.trim();
    if (next === initial) throw new Error("Month nav forward did not change heading");
    await page.getByTestId("calendar-prev-month").click();
    const back = (await heading.textContent())?.trim();
    if (back !== initial) throw new Error("Month nav backward did not restore heading");
    results.push({ step: "month navigation both directions", ok: true });

    console.log(JSON.stringify({ base: BASE, commitSha: health.commitSha, results }, null, 2));
  } catch (err) {
    console.error("[prod-smoke] FAILED:", err.message || err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
