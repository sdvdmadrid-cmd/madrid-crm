import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPreviewLocality,
  formatPreviewStreet,
} from "../../src/lib/import-engine/import-preview-format.js";

test("formatPreviewStreet avoids duplicating city-only address", () => {
  const street = formatPreviewStreet({
    address: "Downers Grove Illinois",
    city: "Downers Grove",
    state: "Illinois",
  });
  assert.equal(street, "");
  assert.equal(
    formatPreviewLocality({
      address: "Downers Grove Illinois",
      city: "Downers Grove",
      state: "Illinois",
    }),
    "Downers Grove, Illinois",
  );
});

test("formatPreviewStreet keeps numeric street lines", () => {
  assert.equal(
    formatPreviewStreet({
      address: "123 Main St",
      city: "Downers Grove",
      state: "IL",
      zip: "60515",
    }),
    "123 Main St",
  );
});
