import "server-only";

import { isSuperAdminRole } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Applies tenant isolation to a Supabase PostgREST query builder.
 * Super admins receive an unscoped query (platform operations only).
 */
export function scopedTable(
  table,
  { tenantDbId, role, column = "tenant_id" } = {},
  select = "*",
) {
  return scopeByTenant(supabaseAdmin.from(table).select(select), {
    tenantDbId,
    role,
    column,
  });
}

export function scopeByTenant(
  query,
  { tenantDbId, role, column = "tenant_id" } = {},
) {
  if (isSuperAdminRole(role)) {
    return query;
  }

  if (!tenantDbId) {
    throw new Error("scopeByTenant: tenantDbId is required for non–super_admin callers");
  }

  return query.eq(column, tenantDbId);
}

/**
 * List pagination params. Unpaginated unless `page`/`limit` query params are set.
 * Set CRM_DEFAULT_LIST_LIMIT (e.g. 50) to enable a server default without breaking
 * existing clients that expect the full list.
 */
export const DEFAULT_UNPAGINATED_CAP = 250;

export function getListPaginationParams(searchParams, { maxLimit = 100 } = {}) {
  const envDefault = Number(process.env.CRM_DEFAULT_LIST_LIMIT || 0);
  const hasExplicit =
    searchParams.has("page") || searchParams.has("limit");

  if (!hasExplicit && !(envDefault > 0)) {
    return { paginate: false, page: 1, limit: 0, from: 0, to: 0 };
  }

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(searchParams.get("limit") || envDefault || 50)),
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return { paginate: true, page, limit, from, to };
}

/** Caps unpaginated list queries to reduce full-table scans on large tenants. */
export function applyUnpaginatedSafetyLimit(query, paginate, cap = DEFAULT_UNPAGINATED_CAP) {
  if (!paginate) {
    return query.limit(cap);
  }
  return query;
}
