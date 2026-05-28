import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCsvText,
  stripUtf8Bom,
} from "../../src/lib/import-engine/csv-parse.js";

test("stripUtf8Bom removes BOM prefix", () => {
  assert.equal(stripUtf8Bom("\uFEFFhello"), "hello");
  assert.equal(stripUtf8Bom("hello"), "hello");
});

test("parseCsvText parses quoted commas and escaped quotes", () => {
  const csv = `name,email\n"Acme, Inc",test@example.com\n"Say ""hi""",other@test.com`;
  const result = parseCsvText(csv);
  assert.deepEqual(result.headers, ["name", "email"]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].name, "Acme, Inc");
  assert.equal(result.rows[0].email, "test@example.com");
  assert.equal(result.rows[1].name, 'Say "hi"');
});

test("parseCsvText returns empty for blank input", () => {
  const result = parseCsvText("   \n  ");
  assert.equal(result.headers.length, 0);
  assert.equal(result.rows.length, 0);
});

test("parseCsvText truncates when maxRows exceeded", () => {
  const csv = "a\n1\n2\n3";
  const result = parseCsvText(csv, { maxRows: 2 });
  assert.equal(result.truncated, true);
  assert.equal(result.totalParsed, 3);
  assert.equal(result.rows.length, 2);
});
