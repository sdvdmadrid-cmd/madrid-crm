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

export {
  applyUnpaginatedSafetyLimit,
  DEFAULT_UNPAGINATED_CAP,
  getListPaginationParams,
} from "@/lib/tenant-list-pagination";
