import { requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { CLIENT_SELECT_COLUMNS, serializeClient } from "@/lib/client-records";
import { buildClientsExportCsv } from "@/lib/import-engine/csv-export";
import { IMPORT_MAX_ROWS } from "@/lib/client-import-service";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import { scopeByTenant } from "@/lib/tenant-scope";

export const runtime = "nodejs";

const TABLE = "clients";
const PAGE_SIZE = 1000;

/**
 * GET /api/clients/export
 * Download tenant clients as a full-profile CSV for re-import.
 */
export async function GET(request) {
  const auth = await requirePrivateTenantApi(request);
  if (!auth.ok) return auth.response;

  try {
    const allRows = [];
    let from = 0;

    while (allRows.length < IMPORT_MAX_ROWS) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await scopeByTenant(
        supabaseAdmin
          .from(TABLE)
          .select(CLIENT_SELECT_COLUMNS)
          .order("name", { ascending: true })
          .range(from, to),
        { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role },
      );

      if (error) {
        logSupabaseError("[api/clients/export][GET] query error", error, {
          tenantDbId: auth.ctx.tenantDbId,
        });
        throw new Error(error.message);
      }

      const batch = data || [];
      allRows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const clients = allRows.map(serializeClient);
    const csv = buildClientsExportCsv(clients);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fieldbase-clients-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/clients/export][GET]", {
      error: error?.message || String(error),
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unable to export clients",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
