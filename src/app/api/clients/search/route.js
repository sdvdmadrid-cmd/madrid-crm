import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { CLIENT_SELECT_COLUMNS, serializeClient } from "@/lib/client-records";
import {
  buildClientSearchOrFilter,
  CLIENT_SEARCH_DEFAULT_LIMIT,
  CLIENT_SEARCH_MAX_LIMIT,
  CLIENT_SEARCH_MIN_QUERY_LENGTH,
  dedupeClientSearchResults,
  rankClientSearchResults,
  sanitizeClientSearchQuery,
} from "@/lib/client-search";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import { scopeByTenant } from "@/lib/tenant-scope";

export const runtime = "nodejs";

const TABLE = "clients";

/**
 * GET /api/clients/search?q=...&limit=12
 * Fast tenant-scoped autocomplete search across client fields.
 */
export async function GET(request) {
  const auth = await requirePrivateTenantApi(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const query = sanitizeClientSearchQuery(searchParams.get("q"));

    if (query.length < CLIENT_SEARCH_MIN_QUERY_LENGTH) {
      return privateJson({ success: true, data: [], query: "" });
    }

    const limit = Math.min(
      CLIENT_SEARCH_MAX_LIMIT,
      Math.max(
        1,
        Number(searchParams.get("limit")) || CLIENT_SEARCH_DEFAULT_LIMIT,
      ),
    );

    const orFilter = buildClientSearchOrFilter(query);
    if (!orFilter) {
      return privateJson({ success: true, data: [], query });
    }

    const poolLimit = Math.min(Math.max(limit * 8, 24), 80);

    let dbQuery = scopeByTenant(
      supabaseAdmin
        .from(TABLE)
        .select(CLIENT_SELECT_COLUMNS)
        .or(orFilter)
        .limit(poolLimit),
      { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role },
    );

    const { data, error } = await dbQuery;

    if (error) {
      logSupabaseError("[api/clients/search][GET] query error", error, {
        tenantDbId: auth.ctx.tenantDbId,
      });
      throw new Error(error.message);
    }

    const ranked = rankClientSearchResults(
      query,
      (data || []).map(serializeClient),
    );
    const results = dedupeClientSearchResults(ranked).slice(0, limit);

    return privateJson({
      success: true,
      data: results,
      query,
      count: results.length,
    });
  } catch (error) {
    console.error("[api/clients/search][GET]", {
      error: error?.message || String(error),
    });
    return privateJson(
      { success: false, error: error?.message || "Client search failed" },
      { status: 500 },
    );
  }
}
