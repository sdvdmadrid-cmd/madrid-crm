import test from "node:test";
import assert from "node:assert/strict";
import {
  mapBuilderLinesToEstimateItems,
  normalizeBuilderClientId,
  resolveBuilderStatus,
  buildEstimateRowFromBuilder,
} from "../../src/lib/migrate-estimate-builder-rows.js";

test("normalizeBuilderClientId accepts uuid only", () => {
  assert.equal(
    normalizeBuilderClientId("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.equal(normalizeBuilderClientId(""), null);
  assert.equal(normalizeBuilderClientId("not-a-uuid"), null);
});

test("mapBuilderLinesToEstimateItems maps qty and price", () => {
  const items = mapBuilderLinesToEstimateItems([
    { name: "Pavers", qty: 2, finalPrice: 300 },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Pavers");
  assert.equal(items[0].qty, 2);
  assert.equal(items[0].price, 600);
});

test("resolveBuilderStatus uses last_sent_at", () => {
  assert.equal(resolveBuilderStatus({}), "draft");
  assert.equal(resolveBuilderStatus({ last_sent_at: "2026-01-01T00:00:00Z" }), "sent");
});

test("buildEstimateRowFromBuilder sets legacy_builder_id", () => {
  const row = buildEstimateRowFromBuilder(
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      tenant_id: "550e8400-e29b-41d4-a716-446655440002",
      client_id: "550e8400-e29b-41d4-a716-446655440003",
      name: "Backyard",
      total_final: 1200,
      lines: [{ name: "Work", qty: 1, finalPrice: 1200 }],
      estimate_number: "EST-20260101-100",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    { estimateNumber: "EST-20260101-100" },
  );
  assert.equal(row.legacy_builder_id, "550e8400-e29b-41d4-a716-446655440001");
  assert.equal(row.client_id, null);
  assert.equal(row.client_name, "Backyard");
  assert.equal(row.total, 1200);
  assert.match(row.notes, /Migrated from legacy Estimate Builder/);
  assert.match(row.notes, /clientUuid/);
});
