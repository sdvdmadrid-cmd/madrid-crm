// Unit tests for resolveInsertTenant in src/lib/tenant-insert.js — the
// shared policy helper that decides which tenant_id to stamp on a
// derived row (duplicate / contract / quote-from-estimate / etc.).
//
// Policy (Phase B hardening):
//   1. Source tenant wins when present.
//   2. If source has no tenant we THROW — never fall back to caller tenant.

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

test("resolveInsertTenant throws when source tenant is missing", () => {
  assert.throws(
    () =>
      resolveInsertTenant({
        sourceTenantId: null,
        callerTenantId: "tenant-caller",
      }),
    /source row is missing tenant_id/i,
  );
  assert.throws(
    () =>
      resolveInsertTenant({
        sourceTenantId: "",
        callerTenantId: "tenant-caller",
      }),
    /source row is missing tenant_id/i,
  );
  assert.throws(
    () =>
      resolveInsertTenant({
        sourceTenantId: "   ",
        callerTenantId: "tenant-caller",
      }),
    /source row is missing tenant_id/i,
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

test("resolveInsertTenant throws when source tenant is unavailable", () => {
  assert.throws(
    () => resolveInsertTenant({ sourceTenantId: null, callerTenantId: null }),
    /source row is missing tenant_id/i,
  );
  assert.throws(
    () => resolveInsertTenant({ sourceTenantId: "", callerTenantId: "" }),
    /source row is missing tenant_id/i,
  );
  assert.throws(
    () => resolveInsertTenant({}),
    /source row is missing tenant_id/i,
  );
  assert.throws(
    () => resolveInsertTenant(),
    /source row is missing tenant_id/i,
  );
});

test("resolveInsertTenant accepts numeric source ids as strings", () => {
  assert.equal(
    resolveInsertTenant({ sourceTenantId: 123, callerTenantId: null }),
    "123",
  );
});
