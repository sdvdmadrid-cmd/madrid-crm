import {
  summarizeInvoiceRevenue,
  summarizeInvoiceRevenueByTenant,
} from "@/lib/invoice-revenue-summary";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

const INVOICE_SUMMARY_COLUMNS =
  "id, tenant_id, amount, paid_amount, balance_due, status";

async function loadInvoiceSummaryRows(tenantDbId, role, scope) {
  let query = supabaseAdmin.from("invoices").select(INVOICE_SUMMARY_COLUMNS);

  const isPlatformScope =
    scope === "platform" && (role || "").toLowerCase() === "super_admin";

  if (!isPlatformScope) {
    query = query.eq("tenant_id", tenantDbId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: data || [], isPlatformScope };
}

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const scope = new URL(request.url).searchParams.get("scope") || "tenant";
    const { rows, isPlatformScope } = await loadInvoiceSummaryRows(
      tenantDbId,
      role,
      scope,
    );

    const summary = summarizeInvoiceRevenue(rows);
    const payload = {
      scope: isPlatformScope ? "platform" : "tenant",
      summary,
      generatedAt: new Date().toISOString(),
    };

    if (isPlatformScope) {
      payload.byTenant = summarizeInvoiceRevenueByTenant(rows);
    }

    return Response.json({ success: true, data: payload });
  } catch (error) {
    console.error("[api/invoices/summary] error", error);
    return Response.json(
      { success: false, error: error?.message || "Unable to load invoice summary" },
      { status: 500 },
    );
  }
}
