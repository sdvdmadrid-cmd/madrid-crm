import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyImportRow,
  mapRecordToClientPayload,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
  validateClientImportPayload,
} from "../../src/lib/import-engine/client-import-validate.js";
import { suggestColumnMapping } from "../../src/lib/import-engine/providers/index.js";

test("normalizePhoneForMatch uses last 10 US digits", () => {
  assert.equal(normalizePhoneForMatch("+1 (312) 555-1212"), "3125551212");
  assert.equal(normalizePhoneForMatch(""), "");
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

test("validateClientImportPayload rejects bad email", () => {
  const result = validateClientImportPayload({
    name: "Jane",
    email: "bad",
  });
  assert.equal(result.ok, false);
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
});

test("suggestColumnMapping maps Jobber-style headers", () => {
  const mapping = suggestColumnMapping(
    ["First Name", "Last Name", "Email", "Mobile Phone", "Street 1"],
    "jobber",
  );
  assert.ok(mapping.name || mapping.email);
});
