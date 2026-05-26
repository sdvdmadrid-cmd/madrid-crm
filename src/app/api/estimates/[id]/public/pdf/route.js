import { getEstimateBrandingByTenant } from "@/lib/estimate-email-branding";
import { parseEstimateNotes } from "@/lib/estimate-notes";
import { buildEstimatePdfBuffer, pdfFilenameForEstimate } from "@/lib/estimate-pdf";
import {
  isValidEstimatePublicToken,
  verifyEstimatePublicAccess,
} from "@/lib/estimate-public-access";
import {
  checkPublicQuoteRateLimit,
  getRequestIp,
  recordPublicQuoteAttempt,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ESTIMATES_TABLE = "estimates";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/estimates/:id/public/pdf?token=...
 *
 * Public, token-gated download. The token is validated through the same
 * helper the public view route uses, so anyone with the original public
 * estimate link can also download the matching PDF. Rate limited per token
 * and per IP to keep the endpoint from being scraped.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) return jsonResponse({ success: false, error: "Missing id" }, 400);

    const url = new URL(request.url);
    const token = String(url.searchParams.get("token") || "").trim();
    if (!isValidEstimatePublicToken(token)) {
      return jsonResponse(
        { success: false, error: "Invalid or missing access token" },
        403,
      );
    }

    const ip = getRequestIp(request);
    const rate = await checkPublicQuoteRateLimit({ token, ip, action: "view" });
    if (!rate.allowed) {
      return jsonResponse(
        { success: false, error: "Too many requests. Please try again later." },
        429,
      );
    }

    const { data, error } = await supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select(
        "id, tenant_id, client_name, status, items, subtotal, tax, total, notes, estimate_number, created_at",
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return jsonResponse({ success: false, error: "Not found" }, 404);
    }

    const access = verifyEstimatePublicAccess(data, token);
    if (!access.ok) {
      return jsonResponse({ success: false, error: access.error }, access.status);
    }

    await recordPublicQuoteAttempt({ token, ip, action: "view" });

    const parsedNotes = parseEstimateNotes(data.notes);
    const estimate = {
      id: data.id,
      tenantId: data.tenant_id || null,
      estimateNumber: data.estimate_number || "",
      status: String(data.status || "draft").toLowerCase(),
      clientName: data.client_name || "",
      clientEmail: parsedNotes.clientEmail || "",
      clientPhone: parsedNotes.clientPhone || "",
      address: parsedNotes.address || "",
      notes: parsedNotes.noteText || "",
      services: Array.isArray(data.items) ? data.items : [],
      subtotal: Number(data.subtotal || 0),
      tax: Number(data.tax || 0),
      total: Number(data.total || 0),
      createdAt: data.created_at || null,
    };

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
    console.error("[api/estimates/:id/public/pdf] error", err);
    return jsonResponse(
      { success: false, error: err?.message || "Failed to build PDF" },
      500,
    );
  }
}
