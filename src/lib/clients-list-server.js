import "server-only";

import {
  CLIENT_SELECT_COLUMNS,
  serializeClient,
} from "@/lib/client-records";
import { CLIENTS_UI_PAGE_SIZE } from "@/lib/clients-list-response";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import { scopeByTenant } from "@/lib/tenant-scope";

const TABLE = "clients";

/**
 * Paginated clients list for server components (same shape as GET /api/clients).
 */
export async function listClientsForTenant(
  { tenantDbId, role, page = 1, limit = CLIENTS_UI_PAGE_SIZE } = {},
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || CLIENTS_UI_PAGE_SIZE));
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const query = scopeByTenant(
    supabaseAdmin
      .from(TABLE)
      .select(CLIENT_SELECT_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to),
    { tenantDbId, role },
  );

  const { data, count, error } = await query;
  if (error) {
    logSupabaseError("[clients-list-server] Supabase query error", error, {
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }

  const total = Number(count || 0);
  const docs = (data || []).map(serializeClient);

  return {
    data: docs,
    total,
    page: safePage,
    limit: safeLimit,
    pages: safeLimit > 0 ? Math.max(1, Math.ceil(total / safeLimit)) : 1,
  };
}
