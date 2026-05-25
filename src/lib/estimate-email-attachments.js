import "server-only";
import { buildEstimatePdfBuffer, pdfFilenameForEstimate } from "@/lib/estimate-pdf";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_PLACEMENTS = new Set(["top_left", "top_center", "top_right"]);

function sanitizeLogoUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("https://") || raw.startsWith("data:image/")) return raw;
  return "";
}

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

/**
 * Build the PDF attachment array for the estimate email. Returns an empty
 * array if the PDF could not be built for any reason — the email still
 * goes out, just without the attachment. This is intentionally fail-soft:
 * a corrupt logo or oversized payload should never block a customer email.
 */
export async function buildEstimateEmailAttachments(estimate) {
  if (!estimate || !estimate.id) return [];
  try {
    const branding = await loadBranding(estimate.tenantId);
    const buffer = await buildEstimatePdfBuffer({ estimate, branding });
    const filename = pdfFilenameForEstimate(estimate);
    return [
      {
        filename,
        content: buffer,
        contentType: "application/pdf",
      },
    ];
  } catch (err) {
    console.warn("[estimate-email-attachments] pdf build failed", {
      estimateId: estimate.id,
      error: err?.message || String(err),
    });
    return [];
  }
}
