/**
 * Guards against orphan CRM rows missing tenant_id.
 * Pure helpers — safe to import from unit tests without server-only deps.
 */

export function hasResolvableTenantId(value) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim();
  return normalized.length > 0 && normalized.toLowerCase() !== "null";
}

/**
 * @throws {Error} when tenant id is missing (insert paths).
 */
export function requireTenantIdForInsert(tenantId, contextLabel = "insert") {
  if (hasResolvableTenantId(tenantId)) {
    return String(tenantId).trim();
  }
  throw new Error(
    `${contextLabel}: tenant_id is required and cannot be null or empty`,
  );
}

/**
 * Returns true when a loaded row is safe to mutate (has tenant scope).
 */
export function rowHasTenantId(row) {
  return hasResolvableTenantId(row?.tenant_id);
}

/**
 * Filter platform metric rows to exclude orphan records.
 */
export function filterRowsWithTenantId(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => rowHasTenantId(row));
}
