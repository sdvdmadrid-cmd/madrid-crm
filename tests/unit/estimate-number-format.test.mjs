import test from "node:test";
import assert from "node:assert/strict";

import {
  ESTIMATE_LOOKUP_LIMIT,
  ESTIMATE_NUMBER_MIN_PAD,
  ESTIMATE_NUMBER_PREFIX,
  formatEstimateNumber,
  pickMaxEstimateSequence,
} from "../../src/lib/estimate-number.js";

/**
 * Tests for the canonical "EST-####" number-format contract. The
 * helpers under test are imported directly from the shared module
 * @/lib/estimate-number so that any drift between this test and the
 * production code is caught immediately. The same module powers the
 * three estimate-creation routes:
 *   - /api/estimates
 *   - /api/estimates/[id]/duplicate
 *   - /api/estimate-builder
 *
 * Contract pinned here:
 *   - prefix is always uppercase "EST-"
 *   - sequences 1..9999 produce a 4-digit zero-padded suffix
 *   - sequences ≥ 10000 produce the natural decimal width
 *     (the "4" in padStart(4) is a floor, not a width cap)
 *   - pickMaxEstimateSequence is robust against malformed rows
 *   - lookup batch size stays at 500 (any change here implies a
 *     concurrency-risk change at the call sites)
 */

test("public constants are stable", () => {
  // If you change these you MUST update the comment block at the top
  // of src/lib/estimate-number.js and inspect every call site for
  // correctness.
  assert.equal(ESTIMATE_NUMBER_PREFIX, "EST-");
  assert.equal(ESTIMATE_NUMBER_MIN_PAD, 4);
  assert.equal(ESTIMATE_LOOKUP_LIMIT, 500);
});

test("formatEstimateNumber pads small sequence numbers to 4 digits", () => {
  assert.equal(formatEstimateNumber(1), "EST-0001");
  assert.equal(formatEstimateNumber(42), "EST-0042");
  assert.equal(formatEstimateNumber(123), "EST-0123");
  assert.equal(formatEstimateNumber(9999), "EST-9999");
});

test("formatEstimateNumber does not truncate sequence numbers past 9999", () => {
  // The critical invariant: padStart(4) is a FLOOR, not a cap. Numbers
  // longer than 4 digits must pass through verbatim. A regression here
  // would either lose the high-order digit or collide every 10000.
  assert.equal(formatEstimateNumber(10000), "EST-10000");
  assert.equal(formatEstimateNumber(10001), "EST-10001");
  assert.equal(formatEstimateNumber(99999), "EST-99999");
  assert.equal(formatEstimateNumber(100000), "EST-100000");
  assert.equal(formatEstimateNumber(1234567), "EST-1234567");
});

test("formatEstimateNumber prefix is always uppercase EST-", () => {
  // The lookup endpoint at /api/estimates/lookup performs a
  // case-insensitive search, but the canonical format we write to the
  // DB is uppercase. Locking that here so a future tweak to lowercase
  // would fail this test before causing a join mismatch elsewhere.
  for (const seq of [1, 100, 9999, 10000, 999999]) {
    assert.match(formatEstimateNumber(seq), /^EST-/);
  }
});

test("formatEstimateNumber preserves monotonicity numerically (but not lex)", () => {
  // Sort order is driven by created_at in production, NOT by the
  // estimate_number string, precisely because lex order breaks at
  // the 9999 -> 10000 boundary: "EST-10000" sorts BELOW "EST-9999"
  // lexicographically. This test documents that pitfall explicitly so
  // a future reader doesn't reintroduce an `order("estimate_number")`
  // and reintroduce the bug.
  assert.equal(formatEstimateNumber(9999) > formatEstimateNumber(10000), true);
  const numericOf = (s) => Number(s.replace(/^EST-/, ""));
  assert.equal(
    numericOf(formatEstimateNumber(9999)) <
      numericOf(formatEstimateNumber(10000)),
    true,
  );
});

test("pickMaxEstimateSequence returns 0 for empty / nullish input", () => {
  assert.equal(pickMaxEstimateSequence(undefined), 0);
  assert.equal(pickMaxEstimateSequence(null), 0);
  assert.equal(pickMaxEstimateSequence([]), 0);
});

test("pickMaxEstimateSequence picks the maximum numeric suffix from a batch", () => {
  const rows = [
    { estimate_number: "EST-0001" },
    { estimate_number: "EST-0042" },
    { estimate_number: "EST-0010" },
  ];
  assert.equal(pickMaxEstimateSequence(rows), 42);
});

test("pickMaxEstimateSequence handles a mix of 4-digit and 5+-digit suffixes", () => {
  // The whole reason we use this helper instead of `order(estimate_number desc) limit 1`
  // is that lex order breaks at the boundary. This test confirms the
  // max picker works correctly across the boundary.
  const rows = [
    { estimate_number: "EST-9999" },
    { estimate_number: "EST-10000" },
    { estimate_number: "EST-9998" },
  ];
  assert.equal(pickMaxEstimateSequence(rows), 10000);
});

test("pickMaxEstimateSequence skips non-conforming rows without throwing", () => {
  // Real data drift: legacy rows with custom prefixes ("E2E-..."),
  // missing values, and odd shapes must all be skipped silently so
  // the production helper never throws on a dirty batch.
  const rows = [
    { estimate_number: "EST-0007" },
    { estimate_number: "E2E-1234" },
    { estimate_number: null },
    { estimate_number: "" },
    { estimate_number: "EST-not-a-number" },
    { estimate_number: 42 },
    {},
    null,
    undefined,
  ];
  assert.equal(pickMaxEstimateSequence(rows), 7);
});

test("pickMaxEstimateSequence is case-insensitive on the prefix", () => {
  // Legacy / hand-edited rows like "est-0003" should still count
  // (an audit found a handful of mixed-case rows in older tenants).
  const rows = [
    { estimate_number: "est-0003" },
    { estimate_number: "Est-0009" },
    { estimate_number: "EST-0005" },
  ];
  assert.equal(pickMaxEstimateSequence(rows), 9);
});
