import {
  bufferFromPdfDocument,
  createLetterPdfDocument,
  renderBrandedPdfHeader,
  renderPdfFooter,
} from "./document-pdf-core.js";

export async function buildClientPdfBuffer({ client, summary = {}, branding = {} }) {
  if (!client?.id) {
    throw new Error("Client payload is required");
  }

  const doc = createLetterPdfDocument({
    Title: `Client ${client.name}`,
    Author: branding.companyName || "FieldBase",
    Subject: "Client Record",
  });

  const bufferPromise = bufferFromPdfDocument(doc);

  const { pageWidth, companyName } = await renderBrandedPdfHeader(doc, {
    title: "Client Record",
    subtitle: client.name || "",
    meta: client.company ? String(client.company) : "",
    branding,
  });

  const address = [client.address, client.city, client.state, client.zip]
    .filter(Boolean)
    .join(", ");

  const fields = [
    ["Email", client.email],
    ["Phone", client.phone],
    ["Service address", address],
    ["Notes", client.notes],
    ["Estimates on file", summary.estimateCount],
    ["Invoices on file", summary.invoiceCount],
    ["Jobs on file", summary.jobCount],
  ];

  doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
  for (const [label, value] of fields) {
    if (value === undefined || value === null || value === "") continue;
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(String(value), { width: pageWidth - 80 });
    doc.moveDown(0.25);
  }

  renderPdfFooter(doc, companyName);
  doc.end();
  return bufferPromise;
}

export function pdfFilenameForClient(client) {
  const safe = String(client?.name || client?.id || "client")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 60);
  return `${safe || "client"}.pdf`;
}
