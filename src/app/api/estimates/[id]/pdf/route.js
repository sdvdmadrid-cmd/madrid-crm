import { enrichEstimateWithPartyInfo } from "@/lib/client-document-party";
import { getEstimatePdfBranding } from "@/lib/estimate-pdf-branding";
import { pdfResponse } from "@/lib/document-pdf-core";
import { buildEstimatePdfBuffer, pdfFilenameForEstimate } from "@/lib/estimate-pdf";
import { serializeEstimateBase } from "@/lib/estimate-serializer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ESTIMATES_TABLE = "estimates";

// pdfkit depends on node:Buffer / node:stream and cannot run on
// edge runtimes. Pin nodejs explicitly so any future hosting target
// that defaults to edge inference doesn't silently break PDF
// downloads. Mirrors estimate-builder/[id]/checkout which already
// pins this.
export const runtime = "nodejs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/estimates/:id/pdf
 *
 * Authenticated, tenant-scoped. Streams a PDF copy of the estimate so the
 * contractor can download or share it directly without using the browser
 * print dialog. Branding (company name + logo) is layered on automatically
 * from company_profiles.
 *
 * Failure modes:
 *   - Estimate not found in tenant: 404
 *   - PDF generation throws: logged, returned as 500 JSON
 */
export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) return jsonResponse({ success: false, error: "Invalid estimate id" }, 400);

    let query = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data) return jsonResponse({ success: false, error: "Estimate not found" }, 404);

    let estimate = serializeEstimateBase(data);
    estimate = await enrichEstimateWithPartyInfo(
      supabaseAdmin,
      estimate.tenantId || tenantDbId,
      estimate,
    );
    const branding = await getEstimatePdfBranding(estimate.tenantId);

    const buffer = await buildEstimatePdfBuffer({ estimate, branding });
    const filename = pdfFilenameForEstimate(estimate);
    const download = new URL(request.url).searchParams.get("download") === "1";

    return pdfResponse(buffer, filename, { download });
  } catch (err) {
    console.error("[api/estimates/:id/pdf] error", err);
    return jsonResponse(
      { success: false, error: err?.message || "Failed to build PDF" },
      500,
    );
  }
}
