import {
  bufferFromPdfDocument,
  createLetterPdfDocument,
  formatDateUtc,
  formatMoney,
  renderBrandedPdfHeader,
  renderPdfFooter,
} from "./document-pdf-core.js";

export async function buildInvoicePdfBuffer({ invoice, branding = {} }) {
  if (!invoice?.id && !invoice?._id) {
    throw new Error("Invoice payload is required");
  }

  const doc = createLetterPdfDocument({
    Title: `Invoice ${invoice.invoiceNumber || invoice.id}`,
    Author: branding.companyName || "FieldBase",
    Subject: "Invoice",
  });

  const bufferPromise = bufferFromPdfDocument(doc);

  const meta = [
    invoice.invoiceNumber ? `# ${invoice.invoiceNumber}` : null,
    invoice.dueDate ? `Due: ${formatDateUtc(invoice.dueDate)}` : null,
    invoice.status ? `Status: ${invoice.status}` : null,
  ]
    .filter(Boolean)
    .join("   |   ");

  const { pageWidth, companyName } = await renderBrandedPdfHeader(doc, {
    title: "Invoice",
    subtitle: invoice.invoiceTitle || "",
    meta,
    branding,
  });

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Bill To");
  doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
  doc.text(invoice.clientName || "—");
  if (invoice.clientEmail) doc.fillColor("#475569").text(invoice.clientEmail);

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(11).text("Amount Due");
  doc.font("Helvetica-Bold").fontSize(14).text(formatMoney(invoice.balanceDue ?? invoice.amount));
  doc.font("Helvetica").fontSize(10).fillColor("#475569");
  doc.text(`Paid: ${formatMoney(invoice.paidAmount || 0)}`);
  doc.text(`Invoice total: ${formatMoney(invoice.amount || 0)}`);

  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  if (lineItems.length) {
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Line Items");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
    for (const line of lineItems) {
      const label = String(line.description || line.name || "Item");
      const amt = formatMoney(line.amount ?? line.price ?? 0);
      doc.text(`${label} — ${amt}`);
    }
  }

  if (invoice.notes) {
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).text("Notes");
    doc.font("Helvetica").fontSize(10).fillColor("#475569").text(String(invoice.notes), {
      width: pageWidth,
    });
  }

  renderPdfFooter(doc, companyName);
  doc.end();
  return bufferPromise;
}

export function pdfFilenameForInvoice(invoice) {
  const id = invoice?.invoiceNumber || invoice?.id || invoice?._id || "invoice";
  return String(id).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) + ".pdf";
}
