import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  filterRowsWithTenantId,
  hasResolvableTenantId,
  requireTenantIdForInsert,
  rowHasTenantId,
} from "../../src/lib/tenant-row-guard.js";

describe("tenant-row-guard", () => {
  test("hasResolvableTenantId rejects null and empty", () => {
    assert.equal(hasResolvableTenantId(null), false);
    assert.equal(hasResolvableTenantId(undefined), false);
    assert.equal(hasResolvableTenantId(""), false);
    assert.equal(hasResolvableTenantId("   "), false);
    assert.equal(hasResolvableTenantId("null"), false);
  });

  test("hasResolvableTenantId accepts uuid and slug ids", () => {
    assert.equal(
      hasResolvableTenantId("d38fec7b-adac-4b7f-a46d-2ccadab6e452"),
      true,
    );
    assert.equal(hasResolvableTenantId("sdvdmadrid-1"), true);
  });

  test("requireTenantIdForInsert returns trimmed id or throws", () => {
    assert.equal(
      requireTenantIdForInsert("  abc-123  ", "test"),
      "abc-123",
    );
    assert.throws(
      () => requireTenantIdForInsert(null, "payments"),
      /payments: tenant_id is required/,
    );
  });

  test("rowHasTenantId and filterRowsWithTenantId", () => {
    assert.equal(rowHasTenantId({ tenant_id: "x" }), true);
    assert.equal(rowHasTenantId({ tenant_id: null }), false);
    const filtered = filterRowsWithTenantId([
      { tenant_id: "a", n: 1 },
      { tenant_id: null, n: 2 },
      { n: 3 },
    ]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].n, 1);
  });
});
