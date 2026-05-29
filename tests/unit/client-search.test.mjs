import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClientSearchOrFilter,
  dedupeClientSearchResults,
  formatClientPickerLabel,
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

test("formatClientPickerLabel joins name and contact meta", () => {
  const label = formatClientPickerLabel({
    name: "Jane Doe",
    phone: "312-555-0100",
  });
  assert.match(label, /Jane Doe/);
  assert.match(label, /312/);
});

test("dedupeClientSearchResults keeps one row per phone or name", () => {
  const rows = [
    { id: "a", name: "4940 Egandale LLC", phone: "7087742564", city: "Brookfield" },
    { id: "b", name: "4940 Egandale LLC", phone: "7087742564", city: "Brookfield" },
    { id: "c", name: "4940 Egandale LLC", phone: "", city: "Brookfield" },
  ];
  const deduped = dedupeClientSearchResults(rows);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, "a");
});
