import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("jobs page prefetches first list page on the server", () => {
  const src = readFileSync(path.join(root, "src/app/jobs/page.js"), "utf8");
  assert.match(src, /listJobsForTenant/);
  assert.match(src, /JobsPageClient/);
  assert.doesNotMatch(src, /"use client"/);
});

test("invoices page prefetches first list page on the server", () => {
  const src = readFileSync(path.join(root, "src/app/invoices/page.js"), "utf8");
  assert.match(src, /listInvoicesForTenant/);
  assert.match(src, /InvoicesPageClient/);
  assert.doesNotMatch(src, /"use client"/);
});

test("dashboard uses client-side cached API fetch hook", () => {
  const src = readFileSync(path.join(root, "src/app/dashboard/page.js"), "utf8");
  assert.match(src, /useCachedApiFetch/);
  assert.doesNotMatch(src, /Promise\.allSettled/);
});

test("weather batch API route exists", () => {
  const src = readFileSync(
    path.join(root, "src/app/api/weather/batch/route.js"),
    "utf8",
  );
  assert.match(src, /resolveWeatherBatch/);
});

test("useWeather posts to weather batch endpoint", () => {
  const src = readFileSync(path.join(root, "src/hooks/useWeather.js"), "utf8");
  assert.match(src, /\/api\/weather\/batch/);
});
