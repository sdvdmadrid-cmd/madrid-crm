import {
  bufferFromPdfDocument,
  createLetterPdfDocument,
  formatDateUtc,
  formatMoney,
  renderBrandedPdfHeader,
} from "./document-pdf-core.js";
import {
  FIELDBASE_WEBSITE_URL,
  getFieldBasePoweredByLabel,
} from "./fieldbase-document-branding.js";
import {
  computeInvoiceLineItemTotal,
  getInvoiceLineItemDescription,
  hasDisplayableInvoiceLineItems,
  normalizeInvoiceLineItemsForSave,
} from "./invoice-line-items.js";
import { renderInvoicePartySection } from "./invoice-party.js";
import { buildInvoicePaymentInstructions } from "./invoice-client-payment-instructions.js";

function renderInvoicePdfFooter(doc, companyName = "") {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const footerY = doc.page.height - doc.page.margins.bottom - 38;
  const generated = `Generated on ${formatDateUtc(new Date().toISOString())}`;
  const contractor = String(companyName || "").trim();

  doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
  doc.text(
    contractor ? `${generated}  ·  ${contractor}` : generated,
    doc.page.margins.left,
    footerY,
    { width: pageWidth, align: "center" },
  );

  doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b");
  doc.text(getFieldBasePoweredByLabel(), doc.page.margins.left, footerY + 13, {
    width: pageWidth,
    align: "center",
    link: FIELDBASE_WEBSITE_URL,
  });
}

function renderInvoiceLineItemsTable(doc, invoice, pageWidth) {
  const items = normalizeInvoiceLineItemsForSave(invoice.lineItems);
  if (!hasDisplayableInvoiceLineItems(items)) return;

  const tableLeft = doc.page.margins.left;
  const colDescW = pageWidth - 52 - 72 - 72;
  const colQtyW = 52;
  const colUnitW = 72;
  const colTotalW = 72;
  const headerH = 22;

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Line Items");
  doc.moveDown(0.25);

  const headerY = doc.y;
  doc.rect(tableLeft, headerY - 2, pageWidth, headerH).fill("#f1f5f9");
  doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(8);
  doc.text("DESCRIPTION", tableLeft + 8, headerY + 4, { width: colDescW - 8 });
  doc.text("QTY", tableLeft + colDescW, headerY + 4, { width: colQtyW, align: "right" });
  doc.text("RATE", tableLeft + colDescW + colQtyW, headerY + 4, {
    width: colUnitW,
    align: "right",
  });
  doc.text("AMOUNT", tableLeft + colDescW + colQtyW + colUnitW, headerY + 4, {
    width: colTotalW,
    align: "right",
  });
  doc.y = headerY + headerH + 4;

  doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
  for (const item of items) {
    const rowY = doc.y;
    const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
    const unit = Number(item.unitPrice || 0);
    const lineTotal = computeInvoiceLineItemTotal(item);
    const label = getInvoiceLineItemDescription(item);

    doc.text(label, tableLeft + 8, rowY, { width: colDescW - 8 });
    doc.text(String(qty), tableLeft + colDescW, rowY, { width: colQtyW, align: "right" });
    doc.text(formatMoney(unit), tableLeft + colDescW + colQtyW, rowY, {
      width: colUnitW,
      align: "right",
    });
    doc.text(formatMoney(lineTotal), tableLeft + colDescW + colQtyW + colUnitW, rowY, {
      width: colTotalW,
      align: "right",
    });
    doc.y = rowY + 16;
  }
}

function renderInvoicePaymentSection(doc, invoice, companyProfile, checkoutUrl, pageWidth) {
  const { textLines } = buildInvoicePaymentInstructions({
    companyProfile: companyProfile || {},
    invoice,
    checkoutUrl,
  });
  if (!textLines.length) return;

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("How to pay");
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(10).fillColor("#475569");
  for (const line of textLines) {
    doc.text(String(line), { width: pageWidth });
  }
}

export async function buildInvoicePdfBuffer({
  invoice,
  branding = {},
  companyProfile = null,
  checkoutUrl = "",
}) {
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

  renderInvoicePartySection(doc, invoice, pageWidth);

  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(11).text("Amount Due");
  doc.font("Helvetica-Bold").fontSize(14).text(formatMoney(invoice.balanceDue ?? invoice.amount));
  doc.font("Helvetica").fontSize(10).fillColor("#475569");
  doc.text(`Paid: ${formatMoney(invoice.paidAmount || 0)}`);
  doc.text(`Invoice total: ${formatMoney(invoice.amount || 0)}`);

  renderInvoiceLineItemsTable(doc, invoice, pageWidth);

  renderInvoicePaymentSection(
    doc,
    invoice,
    companyProfile,
    checkoutUrl || invoice.lastCheckoutUrl || "",
    pageWidth,
  );

  if (invoice.notes) {
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Notes");
    doc.font("Helvetica").fontSize(10).fillColor("#475569").text(String(invoice.notes), {
      width: pageWidth,
    });
  }

  renderInvoicePdfFooter(doc, companyName);
  doc.end();
  return bufferPromise;
}

export function pdfFilenameForInvoice(invoice) {
  const id = invoice?.invoiceNumber || invoice?.id || invoice?._id || "invoice";
  return String(id).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) + ".pdf";
}
