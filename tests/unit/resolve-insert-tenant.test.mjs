// Unit tests for resolveInsertTenant in src/lib/tenant-insert.js — the
// shared policy helper that decides which tenant_id to stamp on a
// derived row (duplicate / contract / quote-from-estimate / etc.).
//
// Policy (mirrors the doc comment on the helper):
//   1. Source tenant wins when present.
//   2. Caller tenant is the fallback when source has none.
//   3. If neither is present we THROW — silently writing tenant_id:null
//      produces rows nobody can read, which is a worse failure than 500.

import assert from "node:assert/strict";
import test from "node:test";

import { resolveInsertTenant } from "../../src/lib/tenant-insert.js";

test("resolveInsertTenant prefers source tenant when present", () => {
  const tenantId = resolveInsertTenant({
    sourceTenantId: "tenant-source",
    callerTenantId: "tenant-caller",
  });
  assert.equal(tenantId, "tenant-source");
});

test("resolveInsertTenant falls back to caller when source is missing", () => {
  assert.equal(
    resolveInsertTenant({
      sourceTenantId: null,
      callerTenantId: "tenant-caller",
    }),
    "tenant-caller",
  );
  assert.equal(
    resolveInsertTenant({
      sourceTenantId: undefined,
      callerTenantId: "tenant-caller",
    }),
    "tenant-caller",
  );
  assert.equal(
    resolveInsertTenant({
      sourceTenantId: "",
      callerTenantId: "tenant-caller",
    }),
    "tenant-caller",
  );
  assert.equal(
    resolveInsertTenant({
      sourceTenantId: "   ",
      callerTenantId: "tenant-caller",
    }),
    "tenant-caller",
  );
});

test("resolveInsertTenant trims whitespace on the resolved value", () => {
  assert.equal(
    resolveInsertTenant({
      sourceTenantId: "  tenant-source  ",
      callerTenantId: "tenant-caller",
    }),
    "tenant-source",
  );
});

test("resolveInsertTenant throws when neither tenant id is available", () => {
  assert.throws(
    () => resolveInsertTenant({ sourceTenantId: null, callerTenantId: null }),
    /neither source nor caller tenant id/i,
  );
  assert.throws(
    () => resolveInsertTenant({ sourceTenantId: "", callerTenantId: "" }),
    /neither source nor caller tenant id/i,
  );
  assert.throws(
    () => resolveInsertTenant({}),
    /neither source nor caller tenant id/i,
  );
  assert.throws(
    () => resolveInsertTenant(),
    /neither source nor caller tenant id/i,
  );
});

test("resolveInsertTenant coerces non-string inputs via String()", () => {
  // Numbers / booleans should not survive in practice — callers pass
  // string ids from Supabase columns. We document the coercion
  // behaviour so a future drift (e.g. a numeric tenant id column)
  // doesn't silently become a runtime crash.
  assert.equal(
    resolveInsertTenant({ sourceTenantId: 123, callerTenantId: null }),
    "123",
  );
  // `false || ""` falls through to caller because the truthy check
  // collapses the source side.
  assert.equal(
    resolveInsertTenant({ sourceTenantId: false, callerTenantId: "fallback" }),
    "fallback",
  );
});
