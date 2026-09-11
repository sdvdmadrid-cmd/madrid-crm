import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("list servers use lean select projections", () => {
  const jobs = readFileSync(path.join(root, "src/lib/jobs-list-server.js"), "utf8");
  const invoices = readFileSync(
    path.join(root, "src/lib/invoices-list-server.js"),
    "utf8",
  );
  const estimates = readFileSync(
    path.join(root, "src/lib/estimates-list-server.js"),
    "utf8",
  );

  assert.match(jobs, /JOBS_LIST_SELECT_COLUMNS/);
  assert.match(jobs, /select\(JOBS_LIST_SELECT_COLUMNS/);
  assert.doesNotMatch(jobs, /JOBS_LIST_SELECT_COLUMNS = \[[^\]]*estimate_snapshot/s);
  assert.match(invoices, /INVOICES_LIST_SELECT_COLUMNS/);
  assert.match(invoices, /select\(INVOICES_LIST_SELECT_COLUMNS/);
  assert.doesNotMatch(
    invoices,
    /INVOICES_LIST_SELECT_COLUMNS = \[[^\]]*"items"/s,
  );
  assert.match(estimates, /ESTIMATES_LIST_SELECT_COLUMNS/);
  assert.match(estimates, /select\(ESTIMATES_LIST_SELECT_COLUMNS/);
});

test("middleware skips custom-domain lookup for app hosts", () => {
  const src = readFileSync(path.join(root, "middleware.js"), "utf8");
  assert.match(src, /fieldbaseapp\.net/);
  assert.match(src, /www\.\$\{configuredDomain\}/);
  assert.match(src, /\/pipeline/);
});

test("marketing scripts stay off authenticated CRM paths", () => {
  const src = readFileSync(
    path.join(root, "src/components/MarketingScripts.js"),
    "utf8",
  );
  assert.match(src, /shouldLoadMarketingScripts/);
  assert.match(src, /lazyOnload/);
});
