import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClientSearchOrFilter,
  dedupeClientSearchResults,
  formatClientPickerLabel,
  formatClientSearchOption,
  rankClientSearchResults,
  sanitizeClientSearchQuery,
  scoreClientSearchMatch,
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

test("buildClientSearchOrFilter limits short queries to name and company", () => {
  const filter = buildClientSearchOrFilter("h");
  assert.match(filter, /name\.ilike\.%h%/);
  assert.match(filter, /company\.ilike\.%h%/);
  assert.doesNotMatch(filter, /email\.ilike/);
  assert.doesNotMatch(filter, /address\.ilike/);
});

test("scoreClientSearchMatch prioritizes name prefix over address substring", () => {
  const henry = scoreClientSearchMatch(
    { name: "Henry Smith", address: "1 Main St" },
    "h",
  );
  const highway = scoreClientSearchMatch(
    { name: "4940 Egandale LLC", address: "123 Highway Rd" },
    "h",
  );
  assert.ok(henry > highway);
});

test("rankClientSearchResults orders best matches first", () => {
  const ranked = rankClientSearchResults("h", [
    { id: "1", name: "4940 Egandale LLC", address: "Highland Park" },
    { id: "2", name: "Henry Jones", phone: "" },
    { id: "3", name: "Zack Homes", company: "HVAC Pros" },
  ]);
  assert.equal(ranked[0].name, "Henry Jones");
  assert.ok(ranked.some((c) => c.name === "Zack Homes"));
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
