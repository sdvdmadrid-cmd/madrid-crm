import { getEstimateBrandingByTenant } from "@/lib/estimate-email-branding";
import { parseEstimateNotes } from "@/lib/estimate-notes";
import { buildEstimatePdfBuffer, pdfFilenameForEstimate } from "@/lib/estimate-pdf";
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

// Safe Number coercion: replaces the unsafe `Number(x || 0)` pattern
// that produces NaN for non-numeric inputs (e.g. string "abc" from
// a manual DB edit). NaN reaches formatMoney downstream, which
// coerces to $0.00 — works today but defensive normalization keeps
// the API shape predictable.
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildEstimatePayload(row) {
  const parsed = parseEstimateNotes(row.notes);
  return {
    id: row.id,
    tenantId: row.tenant_id || null,
    estimateNumber: row.estimate_number || "",
    status: row.status || "draft",
    clientName: row.client_name || "",
    clientEmail: parsed.clientEmail || "",
    clientPhone: parsed.clientPhone || "",
    address: parsed.address || "",
    notes: parsed.noteText || "",
    services: Array.isArray(row.items) ? row.items : [],
    subtotal: toNumber(row.subtotal),
    tax: toNumber(row.tax),
    total: toNumber(row.total),
    createdAt: row.created_at || null,
  };
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

    const estimate = buildEstimatePayload(data);
    const branding = await getEstimateBrandingByTenant(estimate.tenantId);

    const buffer = await buildEstimatePdfBuffer({ estimate, branding });
    const filename = pdfFilenameForEstimate(estimate);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[api/estimates/:id/pdf] error", err);
    return jsonResponse(
      { success: false, error: err?.message || "Failed to build PDF" },
      500,
    );
  }
}
