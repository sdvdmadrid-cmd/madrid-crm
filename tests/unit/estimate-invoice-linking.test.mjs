import test from "node:test";
import assert from "node:assert/strict";

import { resolveEstimateLinkedNumber } from "../../src/lib/estimate-invoice-linking.js";

test("resolveEstimateLinkedNumber prefers estimate_number", () => {
  assert.equal(
    resolveEstimateLinkedNumber({
      estimate_number: "EST-0007",
      quote_number: "99",
    }),
    "0007",
  );
});

test("resolveEstimateLinkedNumber falls back to legacy quote_number field in memory", () => {
  assert.equal(resolveEstimateLinkedNumber({ quote_number: "42" }), "42");
});
