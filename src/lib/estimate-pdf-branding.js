import "server-only";

import { getCompanyDocumentBranding } from "@/lib/company-document-branding";

/**
 * Full contractor branding for estimate PDFs (logo, contact, legal footer).
 */
export async function getEstimatePdfBranding(tenantId) {
  return getCompanyDocumentBranding(tenantId);
}
