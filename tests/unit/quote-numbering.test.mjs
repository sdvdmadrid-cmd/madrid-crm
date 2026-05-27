import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeBaseNumber,
  toCents,
} from "../../src/lib/quote-numbering.js";

// Pin behavior of the helpers extracted from
//   src/app/api/invoices/route.js
//   src/app/api/invoices/[id]/route.js
//   src/app/api/estimate-builder/[id]/promote/route.js
//   src/app/api/estimate-builder/[id]/share-link/route.js
// (previously four byte-for-byte inlined copies).

// ── toCents ────────────────────────────────────────────────────────

test("toCents converts standard dollar amounts to integer cents", () => {
  assert.equal(toCents(1), 100);
  assert.equal(toCents(1.99), 199);
  assert.equal(toCents(12.34), 1234);
});

test("toCents handles floating-point edge cases", () => {
  // 12.34 * 100 = 1234.0000000000002 in IEEE 754.
  // A bigint cents column would reject 1234.0000000000002.
  // Math.round(x * 100) collapses it cleanly to 1234.
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0.1 + 0.2), 30);
});

test("toCents accepts numeric strings", () => {
  assert.equal(toCents("1.99"), 199);
  assert.equal(toCents("0.05"), 5);
});

test("toCents returns 0 for null / undefined / empty", () => {
  assert.equal(toCents(null), 0);
  assert.equal(toCents(undefined), 0);
  assert.equal(toCents(""), 0);
});

test("toCents returns 0 for non-finite inputs (NaN, Infinity)", () => {
  assert.equal(toCents("abc"), 0);
  assert.equal(toCents(Number.NaN), 0);
  assert.equal(toCents(Number.POSITIVE_INFINITY), 0);
  assert.equal(toCents(Number.NEGATIVE_INFINITY), 0);
});

test("toCents preserves negative amounts (e.g. refunds)", () => {
  // toCents must not silently clamp at zero — some callers represent
  // refunds / discounts as negative amounts.
  assert.equal(toCents(-1.5), -150);
});

// ── normalizeBaseNumber ────────────────────────────────────────────

test("normalizeBaseNumber strips a leading EST / QT / INV prefix", () => {
  assert.equal(normalizeBaseNumber("EST-0042"), "0042");
  assert.equal(normalizeBaseNumber("QT-17"), "17");
  assert.equal(normalizeBaseNumber("INV-0099"), "0099");
});

test("normalizeBaseNumber is case-insensitive on the prefix", () => {
  assert.equal(normalizeBaseNumber("est-0042"), "0042");
  assert.equal(normalizeBaseNumber("Qt-17"), "17");
  assert.equal(normalizeBaseNumber("inV-0099"), "0099");
});

test("normalizeBaseNumber accepts separator variants (-, _, space)", () => {
  assert.equal(normalizeBaseNumber("EST 0042"), "0042");
  assert.equal(normalizeBaseNumber("EST_0042"), "0042");
  assert.equal(normalizeBaseNumber("EST-  0042"), "0042");
});

test("normalizeBaseNumber preserves unknown prefixes verbatim", () => {
  // "Q3-Custom" doesn't match EST|QT|INV so it's returned as-is.
  assert.equal(normalizeBaseNumber("Q3-Custom"), "Q3-Custom");
  assert.equal(normalizeBaseNumber("rush-001"), "rush-001");
});

test("normalizeBaseNumber returns '' for blank input", () => {
  assert.equal(normalizeBaseNumber(""), "");
  assert.equal(normalizeBaseNumber(null), "");
  assert.equal(normalizeBaseNumber(undefined), "");
  assert.equal(normalizeBaseNumber("   "), "");
});

test("normalizeBaseNumber falls back to raw when strip would empty it", () => {
  // If a caller passes just the prefix ("EST-"), there's nothing
  // sensible to allocate from — return the trimmed raw so the
  // downstream allocator can decide what to do.
  assert.equal(normalizeBaseNumber("EST-"), "EST-");
  assert.equal(normalizeBaseNumber("INV "), "INV");
});

test("normalizeBaseNumber compacts internal whitespace", () => {
  // "EST 00 42" -> strip prefix -> "00 42" -> compact -> "0042"
  assert.equal(normalizeBaseNumber("EST 00 42"), "0042");
});
