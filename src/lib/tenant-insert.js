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
 * We fall back to `callerTenantId` only when the source has no tenant
 * (legacy / pre-multi-tenant rows, or test fixtures). If neither is
 * present, we throw — silently writing `tenant_id: null` produces rows
 * that no contractor will ever see, which is worse than a 500.
 *
 * @param {object} args
 * @param {string|number|null|undefined} args.sourceTenantId — the
 *   tenant of the source row this derived insert is based on.
 * @param {string|number|null|undefined} args.callerTenantId — the
 *   tenant of the authenticated caller (i.e. `tenantDbId` from
 *   `getAuthenticatedTenantContext`).
 * @returns {string} the tenant_id to write on the new row.
 * @throws if neither tenant id can be resolved.
 */
export function resolveInsertTenant({ sourceTenantId, callerTenantId } = {}) {
  const source = String(sourceTenantId || "").trim();
  if (source) return source;
  const caller = String(callerTenantId || "").trim();
  if (caller) return caller;
  throw new Error(
    "resolveInsertTenant: neither source nor caller tenant id was provided",
  );
}
