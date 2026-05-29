import test from "node:test";
import assert from "node:assert/strict";

import { parseCsvText } from "../../src/lib/import-engine/csv-parse.js";
import {
  classifyImportRow,
  mapRecordToClientPayload,
  validateClientImportPayload,
} from "../../src/lib/import-engine/client-import-validate.js";
import { suggestColumnMapping } from "../../src/lib/import-engine/providers/index.js";

/**
 * End-to-end pipeline test (browser parse → map → validate → classify)
 * without hitting the database.
 */
test("client import pipeline: split-name CRM CSV through preview classification", () => {
  const csv = [
    "First Name,Last Name,Email,Mobile Phone,Street 1,City,State,ZIP",
    "Alice,Smith,alice@example.com,312-555-0100,123 Main St,Chicago,IL,60601",
    "Bob,Smith,bob@example.com,312-555-0200,456 Oak Ave,Chicago,IL,60602",
    "Bad,,not-an-email,123,789 Pine Rd,Chicago,IL,60603",
  ].join("\n");

  const parsed = parseCsvText(csv);
  assert.equal(parsed.rows.length, 3);

  const mapping = suggestColumnMapping(parsed.headers, "standard");
  assert.ok(mapping.firstName);
  assert.ok(mapping.email);

  const preview = parsed.rows.map((record, rowIndex) => {
    const payload = mapRecordToClientPayload(record, mapping);
    const validation = validateClientImportPayload(payload);
    const emailKey = payload.email?.toLowerCase() || "";
    const duplicateInFile =
      rowIndex > 0 &&
      parsed.rows
        .slice(0, rowIndex)
        .some((prev) => {
          const prevPayload = mapRecordToClientPayload(prev, mapping);
          return (
            prevPayload.email?.toLowerCase() === emailKey && Boolean(emailKey)
          );
        });

    return classifyImportRow({
      rowIndex,
      validation,
      duplicateInFile,
      existingClient: null,
    });
  });

  assert.equal(preview[0].status, "ready");
  assert.equal(preview[0].payload.name, "Alice Smith");
  assert.equal(preview[1].status, "ready");
  assert.equal(preview[2].status, "ready");
  assert.equal(preview[2].payload.name, "Bad");
  assert.equal(preview[2].payload.email, "");
  assert.equal(preview[2].payload.phone, "");
});
