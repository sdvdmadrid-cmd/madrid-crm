import "server-only";

import { buildPayStubPdfBuffer, pdfFilenameForPayStub } from "./payroll-stub-pdf.js";
import { loadPayStubContext } from "./payroll-stub-service.js";

export async function buildPayStubEmailAttachments({
  tenantDbId,
  role,
  runId,
  itemId,
}) {
  try {
    const ctx = await loadPayStubContext({ tenantDbId, role, runId, itemId });
    const buffer = await buildPayStubPdfBuffer(ctx);
    const filename = pdfFilenameForPayStub(ctx);
    return [
      {
        filename,
        content: buffer,
        contentType: "application/pdf",
      },
    ];
  } catch (err) {
    console.warn("[payroll-email-attachments] pdf build failed", {
      runId,
      itemId,
      error: err?.message || String(err),
    });
    return [];
  }
}
