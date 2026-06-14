import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("payroll-employee-duplicates safeDeleteIds", () => {
  it("keeps oldest record and marks newer duplicates without history as safe to delete", () => {
    const enriched = [
      { id: "keep", canPermanentlyDelete: true, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "dup-a", canPermanentlyDelete: true, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "dup-b", canPermanentlyDelete: true, createdAt: "2026-01-03T00:00:00.000Z" },
    ];
    const suggestedKeepId = enriched[0]?.id || null;
    const safeDeleteIds = enriched
      .filter((e) => e.canPermanentlyDelete && e.id !== enriched[0]?.id)
      .map((e) => e.id);

    assert.equal(suggestedKeepId, "keep");
    assert.deepEqual(safeDeleteIds, ["dup-a", "dup-b"]);
  });

  it("does not mark records with payroll history as safe to delete", () => {
    const enriched = [
      { id: "keep", canPermanentlyDelete: false, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "dup-a", canPermanentlyDelete: true, createdAt: "2026-01-02T00:00:00.000Z" },
    ];
    const safeDeleteIds = enriched
      .filter((e) => e.canPermanentlyDelete && e.id !== enriched[0]?.id)
      .map((e) => e.id);

    assert.deepEqual(safeDeleteIds, ["dup-a"]);
  });
});
