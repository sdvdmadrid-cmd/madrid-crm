import "server-only";
import { getEstimateBrandingByTenant } from "@/lib/estimate-email-branding";
import { buildEstimatePdfBuffer, pdfFilenameForEstimate } from "@/lib/estimate-pdf";

/**
 * Build the PDF attachment array for the estimate email. Returns an empty
 * array if the PDF could not be built for any reason — the email still
 * goes out, just without the attachment. This is intentionally fail-soft:
 * a corrupt logo or oversized payload should never block a customer email.
 */
export async function buildEstimateEmailAttachments(estimate) {
  if (!estimate || !estimate.id) return [];
  try {
    const branding = await getEstimateBrandingByTenant(estimate.tenantId);
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
