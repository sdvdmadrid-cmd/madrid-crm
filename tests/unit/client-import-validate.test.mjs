import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyImportRow,
  mapRecordToClientPayload,
  normalizeEmailForMatch,
  normalizeNameForMatch,
  normalizePhoneForMatch,
  validateClientImportPayload,
} from "../../src/lib/import-engine/client-import-validate.js";
import {
  detectImportFormat,
  detectImportProvider,
  suggestColumnMapping,
} from "../../src/lib/import-engine/providers/index.js";

test("normalizePhoneForMatch uses last 10 US digits", () => {
  assert.equal(normalizePhoneForMatch("+1 (312) 555-1212"), "3125551212");
  assert.equal(normalizePhoneForMatch(""), "");
});

test("normalizeNameForMatch collapses whitespace and case", () => {
  assert.equal(normalizeNameForMatch("  Jane   Doe "), "jane doe");
});

test("normalizeEmailForMatch lowercases valid emails", () => {
  assert.equal(normalizeEmailForMatch("  Test@Example.COM "), "test@example.com");
  assert.equal(normalizeEmailForMatch("not-an-email"), "");
});

test("validateClientImportPayload requires name", () => {
  const result = validateClientImportPayload({ name: "" });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Name is required/);
});

test("validateClientImportPayload clears bad email and still imports", () => {
  const result = validateClientImportPayload({
    name: "Jane",
    email: "bad",
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.email, "");
});

test("validateClientImportPayload keeps first email when CSV has two", () => {
  const result = validateClientImportPayload({
    name: "Jane",
    email: "jane@a.com; other@b.com",
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.email, "jane@a.com");
});

test("mapRecordToClientPayload respects mapping headers", () => {
  const record = { "Full Name": "Bob", "E-mail": "bob@test.com" };
  const payload = mapRecordToClientPayload(record, {
    name: "Full Name",
    email: "E-mail",
  });
  assert.equal(payload.name, "Bob");
  assert.equal(payload.email, "bob@test.com");
});

test("mapRecordToClientPayload combines first and last name", () => {
  const record = { "First Name": "Jane", "Last Name": "Doe" };
  const payload = mapRecordToClientPayload(record, {
    firstName: "First Name",
    lastName: "Last Name",
  });
  assert.equal(payload.name, "Jane Doe");
  assert.equal(validateClientImportPayload(payload).ok, true);
});

test("classifyImportRow detects duplicate in file", () => {
  const row = classifyImportRow({
    rowIndex: 2,
    validation: validateClientImportPayload({ name: "Bob", email: "a@b.com" }),
    duplicateInFile: true,
    existingClient: null,
  });
  assert.equal(row.status, "duplicate_file");
  assert.match(row.errors.join(" "), /Duplicate name, email, or phone/);
});

test("validateClientImportPayload clears invalid phone and still imports", () => {
  const result = validateClientImportPayload({
    name: "Bob",
    phone: "123",
    email: "bob@test.com",
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.phone, "");
});

test("suggestColumnMapping maps common CRM export headers", () => {
  const mapping = suggestColumnMapping(
    ["First Name", "Last Name", "Email", "Mobile Phone", "Street 1"],
    "standard",
  );
  assert.ok(mapping.firstName);
  assert.ok(mapping.email);
  assert.ok(mapping.phone);
});

test("suggestColumnMapping prefers service street over billing street", () => {
  const mapping = suggestColumnMapping([
    "Display Name",
    "Billing Street 1",
    "Service Street 1",
    "Service City",
    "Billing City",
    "Email",
    "Mobile Phone",
  ]);
  assert.equal(mapping.address, "Service Street 1");
  assert.equal(mapping.city, "Service City");
  assert.notEqual(mapping.address, "Billing Street 1");
});

test("detectImportFormat recognizes common CRM export headers", () => {
  assert.equal(
    detectImportFormat([
      "First Name",
      "Last Name",
      "Street 1",
      "Mobile Phone",
    ]),
    "standard",
  );
  assert.equal(detectImportProvider(["Name", "Email"]), "generic");
});

test("mapRecordToClientPayload picks unmapped columns via aliases", () => {
  const record = {
    "First Name": "Jane",
    "Last Name": "Doe",
    "Billing Email": "jane@example.com",
    "Main Phone": "312-555-9999",
    "Street 1": "1 Main",
    City: "Chicago",
    State: "IL",
    ZIP: "60601",
    "Company Name": "Acme LLC",
    Tags: "VIP",
  };
  const payload = mapRecordToClientPayload(record, {
    firstName: "First Name",
    lastName: "Last Name",
  });
  assert.equal(payload.name, "Jane Doe");
  assert.equal(payload.email, "jane@example.com");
  assert.equal(payload.phone, "312-555-9999");
  assert.equal(payload.company, "Acme LLC");
  assert.equal(payload.notes, "VIP");
});
