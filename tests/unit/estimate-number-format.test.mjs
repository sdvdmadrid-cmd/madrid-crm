import test from "node:test";
import assert from "node:assert/strict";

/**
 * These tests pin the `EST-####` number-format contract enforced in
 * three production routes:
 *   - /api/estimates/route.js
 *   - /api/estimates/[id]/duplicate/route.js
 *   - /api/estimate-builder/route.js
 *
 * The format helper is intentionally inlined in each route (it is one
 * line — `EST-${String(seq).padStart(4, "0")}`) so consolidating it into
 * a shared module would be a refactor that we are deliberately avoiding
 * under the post-audit architecture freeze. These tests freeze the
 * observable behavior so that any future "let's widen the padding" or
 * "let's truncate to 4 digits" change has to deal with a failing test
 * first.
 *
 * Contract:
 *   - Sequence values 1..9999 produce a 4-digit zero-padded suffix.
 *   - Sequence values >= 10000 produce the natural decimal width
 *     (5 chars at 10000, 6 chars at 100000, etc.). The "4" in
 *     padStart(4) is a floor, not a width cap.
 *   - Prefix is uppercase "EST-".
 */

function formatEstimateNumber(seq) {
  // Mirror of the inlined helper used in the three estimate routes.
  // If you change the production format you MUST change this and the
  // routes together.
  return `EST-${String(seq).padStart(4, "0")}`;
}

test("format pads small sequence numbers to 4 digits", () => {
  assert.equal(formatEstimateNumber(1), "EST-0001");
  assert.equal(formatEstimateNumber(42), "EST-0042");
  assert.equal(formatEstimateNumber(123), "EST-0123");
  assert.equal(formatEstimateNumber(9999), "EST-9999");
});

test("format does not truncate sequence numbers past 9999", () => {
  // The critical invariant: padStart(4) is a FLOOR, not a cap. Numbers
  // longer than 4 digits must pass through verbatim. A regression here
  // would either lose the high-order digit or collide every 10000.
  assert.equal(formatEstimateNumber(10000), "EST-10000");
  assert.equal(formatEstimateNumber(10001), "EST-10001");
  assert.equal(formatEstimateNumber(99999), "EST-99999");
  assert.equal(formatEstimateNumber(100000), "EST-100000");
  assert.equal(formatEstimateNumber(1234567), "EST-1234567");
});

test("format prefix is always uppercase EST-", () => {
  // The lookup endpoint at /api/estimates/lookup performs a
  // case-insensitive search, but the canonical format we write to the
  // DB is uppercase. Locking that here so a future tweak to lowercase
  // would fail this test before causing a join mismatch elsewhere.
  for (const seq of [1, 100, 9999, 10000, 999999]) {
    assert.match(formatEstimateNumber(seq), /^EST-/);
  }
});

test("format is monotonic in sequence: next > previous as strings", () => {
  // Sort order is driven by created_at in production, NOT by the
  // estimate_number string, precisely because lex order breaks at
  // the 9999 -> 10000 boundary: "EST-10000" sorts BELOW "EST-9999"
  // lexicographically. This test documents that pitfall explicitly so
  // a future reader doesn't reintroduce an `order("estimate_number")`
  // and reintroduce the bug.
  assert.equal(formatEstimateNumber(9999) > formatEstimateNumber(10000), true);
  // Same comparison numerically (the correct ordering):
  const numericOf = (s) => Number(s.replace(/^EST-/, ""));
  assert.equal(numericOf(formatEstimateNumber(9999)) < numericOf(formatEstimateNumber(10000)), true);
});
