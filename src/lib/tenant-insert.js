// Pure tenant-resolution helpers used during INSERTs of derived rows
// (duplicating an estimate, generating a contract from an estimate,
// generating a quote from an estimate, etc.).
//
// This module is deliberately small and dependency-free so the unit
// tests under tests/unit/ can import it directly under node:test
// without pulling the auth / Supabase tree that @/lib/tenant.js
// drags in for the role / session helpers. Route code should import
// from "@/lib/tenant" alongside the auth helpers — that module just
// re-exports `resolveInsertTenant` from here.

import { hasResolvableTenantId } from "./tenant-row-guard.js";

/**
 * Resolve the tenant_id to stamp onto a row that is being derived from
 * an existing row.
 *
 * Policy: the derived row always inherits the SOURCE row's tenant. This
 * matters for super_admin callers who can read across tenants — without
 * this rule a super_admin generating a contract for tenant X would
 * stamp the contract with the platform tenant id and orphan it from
 * the contractor.
 *
 * For regular (non-super-admin) callers, the source row was already
 * filtered by their own tenant_id at read time, so `sourceTenantId ===
 * callerTenantId` always holds and the resolved value is identical.
 *
 * We no longer fall back to `callerTenantId` when the source row lacks a
 * tenant — that would stamp the wrong tenant on a derived record and mask
 * orphan data. If the source has no tenant, we throw.
 *
 * @param {object} args
 * @param {string|number|null|undefined} args.sourceTenantId — the
 *   tenant of the source row this derived insert is based on.
 * @param {string|number|null|undefined} args.callerTenantId — retained for
 *   call-site compatibility; not used when source tenant is missing.
 * @returns {string} the tenant_id to write on the new row.
 * @throws if source tenant id cannot be resolved.
 */
export function resolveInsertTenant({ sourceTenantId } = {}) {
  if (hasResolvableTenantId(sourceTenantId)) {
    return String(sourceTenantId).trim();
  }
  throw new Error(
    "resolveInsertTenant: source row is missing tenant_id; cannot create derived record",
  );
}
