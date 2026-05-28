import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { CLIENT_SELECT_COLUMNS, serializeClient } from "@/lib/client-records";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";

const CLIENTS = "clients";
const ESTIMATES = "estimate_builder";
const INVOICES = "invoices";

export const runtime = "nodejs";

/**
 * GET /api/clients/:id/details
 * Returns full client record plus linked estimates/invoices for details panel.
 */
export async function GET(request, { params }) {
  const auth = await requirePrivateTenantApi(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) {
      return privateJson(
        { success: false, error: "Invalid client id" },
        { status: 400 },
      );
    }

    const clientQuery = scopeByTenant(
      supabaseAdmin
        .from(CLIENTS)
        .select(CLIENT_SELECT_COLUMNS)
        .eq("id", id)
        .maybeSingle(),
      { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role },
    );

    const estimatesQuery = scopeByTenant(
      supabaseAdmin
        .from(ESTIMATES)
        .select("id, estimate_number, quote_number, status, updated_at, created_at")
        .eq("client_id", id)
        .order("updated_at", { ascending: false })
        .limit(20),
      { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role },
    );

    const invoicesQuery = scopeByTenant(
      supabaseAdmin
        .from(INVOICES)
        .select("id, invoice_number, status, amount, due_date, updated_at")
        .eq("client_id", id)
        .order("updated_at", { ascending: false })
        .limit(20),
      { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role },
    );

    const estimateCountQuery = scopeByTenant(
      supabaseAdmin
        .from(ESTIMATES)
        .select("id", { count: "exact", head: true })
        .eq("client_id", id),
      { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role },
    );

    const invoiceCountQuery = scopeByTenant(
      supabaseAdmin
        .from(INVOICES)
        .select("id", { count: "exact", head: true })
        .eq("client_id", id),
      { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role },
    );

    const [
      { data: client, error: clientError },
      { data: estimates, error: estimatesError },
      { data: invoices, error: invoicesError },
      { count: estimateCount, error: estimateCountError },
      { count: invoiceCount, error: invoiceCountError },
    ] = await Promise.all([
      clientQuery,
      estimatesQuery,
      invoicesQuery,
      estimateCountQuery,
      invoiceCountQuery,
    ]);

    const firstError =
      clientError ||
      estimatesError ||
      invoicesError ||
      estimateCountError ||
      invoiceCountError;
    if (firstError) throw new Error(firstError.message);

    if (!client) {
      return privateJson(
        { success: false, error: "Client not found" },
        { status: 404 },
      );
    }

    return privateJson({
      success: true,
      data: {
        client: serializeClient(client),
        estimates: estimates || [],
        invoices: invoices || [],
        estimateSummary: { total: Number(estimateCount || 0) },
        invoiceSummary: { total: Number(invoiceCount || 0) },
      },
    });
  } catch (error) {
    console.error("[api/clients/:id/details][GET]", {
      error: error?.message || String(error),
    });
    return privateJson(
      { success: false, error: error?.message || "Failed to load client details" },
      { status: 500 },
    );
  }
}
