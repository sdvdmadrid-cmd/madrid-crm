import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("quote public page defines financials and changesForm", () => {
  const src = readFileSync(
    path.join(root, "src/app/quote/[token]/page.js"),
    "utf8",
  );
  assert.match(src, /const \[changesForm, setChangesForm\] = useState\(/);
  assert.match(src, /const financials = useMemo\(/);
  assert.match(src, /computeEstimateFinancials\(\{/);
  assert.match(src, /baseAmount:\s*job\.price/);
});

test("middleware disables legacy bill-pay for public and private paths", () => {
  const src = readFileSync(path.join(root, "middleware.js"), "utf8");
  assert.match(src, /disabledBillPayTarget === "page"/);
  assert.match(src, /disabledBillPayTarget === "api"/);
  assert.match(src, /pathname = "\/expenses"/);
  assert.doesNotMatch(
    src,
    /favicon\.ico\|robots\.txt\|public\|api\/public/,
  );
  assert.match(
    src,
    /favicon\.ico\|robots\.txt\|api\/public/,
  );
});

test("next.config redirects legacy bill-pay pages", () => {
  const src = readFileSync(path.join(root, "next.config.mjs"), "utf8");
  assert.match(src, /source:\s*"\/bill-payments"/);
  assert.match(src, /source:\s*"\/public\/bill-payments"/);
  assert.match(src, /destination:\s*"\/expenses"/);
});

test("bill-payments access gate returns BILL_PAY_DISABLED", () => {
  const src = readFileSync(path.join(root, "src/lib/bill-payments.js"), "utf8");
  assert.match(src, /requireBillPaymentsAccess/);
  assert.match(src, /billPayDisabledResponse/);
});

test("sitemap omits bare tokenless quote and estimate routes", () => {
  const src = readFileSync(path.join(root, "src/app/sitemap.js"), "utf8");
  assert.doesNotMatch(src, /path:\s*"\/quote"/);
  assert.doesNotMatch(src, /path:\s*"\/estimate"/);
  assert.match(src, /path:\s*"\/subscribe"/);
});
