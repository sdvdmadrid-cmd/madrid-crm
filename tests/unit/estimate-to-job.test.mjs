import test from "node:test";
import assert from "node:assert/strict";

import { buildJobInsertFromEstimate } from "../../src/lib/estimate-to-job.js";
import { ESTIMATE_NOTES_KIND } from "../../src/lib/estimate-notes.js";

test("buildJobInsertFromEstimate maps approved estimate into job row", () => {
  const nowIso = "2026-05-28T12:00:00.000Z";
  const row = buildJobInsertFromEstimate(
    {
      id: 42,
      estimate_number: "EST-0042",
      client_name: "Acme LLC",
      client_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      items: [{ id: "line-1", name: "Kitchen remodel", qty: 1, price: 5000 }],
      subtotal: 5000,
      tax: 0,
      total: 5000,
      notes: JSON.stringify({
        kind: ESTIMATE_NOTES_KIND,
        noteText: "Full kitchen scope",
        serviceTitle: "Kitchen remodel",
        clientUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      }),
    },
    { tenantId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", userId: "user-1", nowIso },
  );

  assert.equal(row.tenant_id, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  assert.equal(row.title, "EST-0042 — Acme LLC");
  assert.equal(row.client_name, "Acme LLC");
  assert.equal(row.service, "Kitchen remodel");
  assert.equal(row.price, "5000");
  assert.equal(row.status, "Pending");
  assert.equal(row.estimate_snapshot.source, "approved_estimate");
  assert.equal(row.estimate_snapshot.estimateId, 42);
  assert.equal(row.estimate_snapshot.estimateNumber, "EST-0042");
});
