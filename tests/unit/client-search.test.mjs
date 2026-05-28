import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClientSearchOrFilter,
  formatClientSearchOption,
  sanitizeClientSearchQuery,
} from "../../src/lib/client-search.js";

test("sanitizeClientSearchQuery strips PostgREST-breaking characters", () => {
  assert.equal(sanitizeClientSearchQuery("  acme, inc_%  "), "acme inc");
  assert.equal(sanitizeClientSearchQuery("a".repeat(120)).length, 80);
});

test("buildClientSearchOrFilter includes core fields and phone digits", () => {
  const filter = buildClientSearchOrFilter("312-555-1212");
  assert.match(filter, /name\.ilike\.%312-555-1212%/);
  assert.match(filter, /phone\.ilike\.%3125551212%/);
});

test("buildClientSearchOrFilter returns empty for blank query", () => {
  assert.equal(buildClientSearchOrFilter("   "), "");
});

test("formatClientSearchOption builds display meta", () => {
  const option = formatClientSearchOption({
    id: "1",
    name: "Jane Doe",
    company: "Acme",
    phone: "312-555-0100",
    email: "jane@test.com",
    address: "123 Main",
    city: "Chicago",
    state: "IL",
  });
  assert.equal(option.name, "Jane Doe");
  assert.match(option.subtitle, /Acme/);
  assert.match(option.location, /Chicago/);
});
