import { buildEstimatePdfBuffer, pdfFilenameForEstimate } from "@/lib/estimate-pdf";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ESTIMATES_TABLE = "estimates";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseNotes(notes) {
  const raw = String(notes || "").trim();
  if (!raw) return { address: "", noteText: "", clientEmail: "", clientPhone: "" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.kind === "estimate_pipeline") {
      return {
        address: String(parsed.address || ""),
        noteText: String(parsed.noteText || ""),
        clientEmail: String(parsed.clientEmail || ""),
        clientPhone: String(parsed.clientPhone || ""),
      };
    }
  } catch {
    // legacy plain-text notes
  }
  return { address: "", noteText: raw, clientEmail: "", clientPhone: "" };
}

function sanitizeLogoUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("https://") || raw.startsWith("data:image/")) return raw;
  return "";
}

const ALLOWED_PLACEMENTS = new Set(["top_left", "top_center", "top_right"]);

async function loadBranding(tenantId) {
  const fallback = { companyName: "", logoUrl: "", logoPlacement: "top_left" };
  const id = String(tenantId || "").trim();
  if (!id) return fallback;

  try {
    const { data, error } = await supabaseAdmin
      .from("company_profiles")
      .select("company_name, logo_url, logo_data_url, logo_placement")
      .eq("tenant_id", id)
      .maybeSingle();
    if (error || !data) return fallback;
    const placement = ALLOWED_PLACEMENTS.has(String(data.logo_placement || "").toLowerCase())
      ? String(data.logo_placement).toLowerCase()
      : "top_left";
    return {
      companyName: String(data.company_name || "").trim(),
      logoUrl:
        sanitizeLogoUrl(data.logo_url) || sanitizeLogoUrl(data.logo_data_url),
      logoPlacement: placement,
    };
  } catch {
    return fallback;
  }
}

function buildEstimatePayload(row) {
  const parsed = parseNotes(row.notes);
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
    subtotal: Number(row.subtotal || 0),
    tax: Number(row.tax || 0),
    total: Number(row.total || 0),
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
    const branding = await loadBranding(estimate.tenantId);

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
