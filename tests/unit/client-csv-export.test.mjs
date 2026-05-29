import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClientsExportCsv,
  clientToExportCells,
  encodeCsvCell,
  splitClientName,
} from "../../src/lib/import-engine/csv-export.js";

test("splitClientName splits on first token", () => {
  assert.deepEqual(splitClientName("Jane Marie Doe"), {
    firstName: "Jane",
    lastName: "Marie Doe",
  });
});

test("encodeCsvCell quotes values with commas", () => {
  assert.equal(encodeCsvCell("Acme, LLC"), '"Acme, LLC"');
});

test("clientToExportCells maps serialized client fields", () => {
  const cells = clientToExportCells({
    name: "Bob Smith",
    company: "Acme",
    email: "bob@test.com",
    phone: "312-555-0100",
    address: "123 Main",
    city: "Chicago",
    state: "IL",
    zip: "60601",
    notes: "VIP",
  });
  assert.equal(cells[0], "Bob");
  assert.equal(cells[1], "Smith");
  assert.equal(cells[2], "Acme");
});

test("buildClientsExportCsv includes UTF-8 BOM and header row", () => {
  const csv = buildClientsExportCsv([
    { name: "Alice", email: "a@test.com" },
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /First Name,Last Name,Company,Email/);
  assert.match(csv, /Billing Street/);
  assert.match(csv, /Alice/);
});
