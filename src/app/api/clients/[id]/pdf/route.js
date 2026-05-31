import { getEstimateBrandingByTenant } from "@/lib/estimate-email-branding";
import { pdfResponse } from "@/lib/document-pdf-core";
import { buildClientPdfBuffer, pdfFilenameForClient } from "@/lib/client-pdf";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

const CLIENTS = "clients";

function serializeClient(row) {
  return {
    id: row.id,
    name: row.name || "",
    company: row.company || "",
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip || row.zip_code || "",
    notes: row.notes || "",
    tenantId: row.tenant_id || "",
  };
}

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) {
      return Response.json({ success: false, error: "Invalid client id" }, { status: 400 });
    }

    let query = supabaseAdmin.from(CLIENTS).select("*").eq("id", id).maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data) {
      return Response.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const client = serializeClient(data);

    const [estRes, invRes, jobRes] = await Promise.all([
      supabaseAdmin
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantDbId)
        .ilike("notes", `%${client.id}%`),
      supabaseAdmin
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantDbId)
        .eq("client_id", client.id),
      supabaseAdmin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantDbId)
        .eq("client_id", client.id),
    ]);

    const summary = {
      estimateCount: estRes.count ?? 0,
      invoiceCount: invRes.count ?? 0,
      jobCount: jobRes.count ?? 0,
    };

    const branding = await getEstimateBrandingByTenant(client.tenantId);
    const buffer = await buildClientPdfBuffer({ client, summary, branding });
    const filename = pdfFilenameForClient(client);
    const download = new URL(request.url).searchParams.get("download") === "1";

    return pdfResponse(buffer, filename, { download });
  } catch (err) {
    console.error("[api/clients/:id/pdf] error", err);
    return Response.json(
      { success: false, error: err?.message || "Failed to build PDF" },
      { status: 500 },
    );
  }
}
