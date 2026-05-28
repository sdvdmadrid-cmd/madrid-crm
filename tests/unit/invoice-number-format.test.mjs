import test from "node:test";
import assert from "node:assert/strict";

import {
  INVOICE_LOOKUP_LIMIT,
  INVOICE_NUMBER_MIN_PAD,
  INVOICE_NUMBER_PREFIX,
  formatInvoiceNumber,
  pickMaxInvoiceSequence,
} from "../../src/lib/invoice-number.js";

// Mirror of tests/unit/estimate-number-format.test.mjs. These pin the
// behavior of the pure invoice-numbering helpers used by:
//   - /api/invoices (POST)
//   - /api/estimate-builder/[id]/checkout
// both of which previously used COUNT(*) + 1 and have now been
// rewritten to MAX(numeric suffix) + 1 backed by a partial unique
// index on (tenant_id, invoice_number).

test("constants are stable", () => {
  assert.equal(INVOICE_NUMBER_PREFIX, "INV-");
  assert.equal(INVOICE_NUMBER_MIN_PAD, 4);
  assert.equal(INVOICE_LOOKUP_LIMIT, 500);
});

test("formatInvoiceNumber pads to 4 digits", () => {
  assert.equal(formatInvoiceNumber(1), "INV-0001");
  assert.equal(formatInvoiceNumber(42), "INV-0042");
  assert.equal(formatInvoiceNumber(9999), "INV-9999");
});

test("formatInvoiceNumber widens past 4 digits without truncating", () => {
  // The pad is a FLOOR, not a CAP. Once a tenant hits 10000 invoices
  // they keep going — they don't get reset to "INV-0001".
  assert.equal(formatInvoiceNumber(10000), "INV-10000");
  assert.equal(formatInvoiceNumber(99999), "INV-99999");
  assert.equal(formatInvoiceNumber(100000), "INV-100000");
});

test("pickMaxInvoiceSequence returns 0 for empty / nullish input", () => {
  assert.equal(pickMaxInvoiceSequence([]), 0);
  assert.equal(pickMaxInvoiceSequence(null), 0);
  assert.equal(pickMaxInvoiceSequence(undefined), 0);
});

test("pickMaxInvoiceSequence finds the max numeric suffix across canonical rows", () => {
  const rows = [
    { invoice_number: "INV-0001" },
    { invoice_number: "INV-0042" },
    { invoice_number: "INV-0007" },
  ];
  assert.equal(pickMaxInvoiceSequence(rows), 42);
});

test("pickMaxInvoiceSequence is case-insensitive on the INV- prefix", () => {
  const rows = [
    { invoice_number: "inv-0005" },
    { invoice_number: "INV-0003" },
  ];
  assert.equal(pickMaxInvoiceSequence(rows), 5);
});

test("pickMaxInvoiceSequence skips non-canonical rows", () => {
  // Custom / hand-edited numbers ("INV-Q3-2024", "RUSH-001") should
  // coexist without disrupting allocation — only canonical INV-####
  // contribute to the max.
  const rows = [
    { invoice_number: "INV-0010" },
    { invoice_number: "INV-Q3-2024" },
    { invoice_number: "RUSH-001" },
    { invoice_number: "" },
    { invoice_number: null },
    {},
  ];
  assert.equal(pickMaxInvoiceSequence(rows), 10);
});

test("pickMaxInvoiceSequence handles INV-large-numbers (post-9999)", () => {
  const rows = [
    { invoice_number: "INV-0042" },
    { invoice_number: "INV-12345" },
    { invoice_number: "INV-9999" },
  ];
  assert.equal(pickMaxInvoiceSequence(rows), 12345);
});

test("pickMaxInvoiceSequence ignores NaN / non-finite suffixes", () => {
  // /^INV-(\d+)$/ already excludes these but pin the contract.
  const rows = [
    { invoice_number: "INV-" },
    { invoice_number: "INV-abc" },
    { invoice_number: "INV-1e3" },
    { invoice_number: "INV-3" },
  ];
  assert.equal(pickMaxInvoiceSequence(rows), 3);
});
