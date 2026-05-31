import "server-only";

import {
  bufferFromPdfDocument,
  createLetterPdfDocument,
  formatDateUtc,
  formatMoney,
  renderBrandedPdfHeader,
} from "./document-pdf-core.js";
import {
  buildPaymentSchedule,
  displayServiceLineName,
  formatPdfMetaLines,
  mergeTermsSections,
  parseScopeOfWorkBlocks,
} from "./estimate-pdf-content.js";

const SLATE_900 = "#0f172a";
const SLATE_600 = "#475569";
const SLATE_500 = "#64748b";
const SLATE_400 = "#94a3b8";
const SLATE_200 = "#e2e8f0";
const SLATE_100 = "#f1f5f9";
function ensureSpace(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) {
    doc.addPage();
  }
}

function drawSectionTitle(doc, title, pageWidth) {
  ensureSpace(doc, 36);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(SLATE_900).text(title);
  doc.moveDown(0.35);
  doc
    .strokeColor(SLATE_200)
    .lineWidth(0.75)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + pageWidth, doc.y)
    .stroke();
  doc.moveDown(0.45);
}

function renderCompanyContact(doc, branding, pageWidth) {
  const lines = [];
  if (branding.phone) lines.push(branding.phone);
  if (branding.email) lines.push(branding.email);
  if (branding.websiteUrl) {
    const site = branding.websiteUrl.replace(/^https?:\/\//i, "");
    lines.push(site);
  }
  if (branding.businessAddress) lines.push(branding.businessAddress);

  if (!lines.length) return;

  doc.font("Helvetica").fontSize(9).fillColor(SLATE_500);
  for (const line of lines) {
    doc.text(line, { width: pageWidth, align: "left" });
  }
  doc.moveDown(0.5);
}

function renderClientAndProject(doc, estimate, pageWidth) {
  const colGap = 24;
  const colW = (pageWidth - colGap) / 2;
  const leftX = doc.page.margins.left;
  const rightX = leftX + colW + colGap;
  const startY = doc.y;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(SLATE_500);
  doc.text("PREPARED FOR", leftX, startY, { width: colW });
  doc.text("PROJECT", rightX, startY, { width: colW });

  const bodyY = startY + 14;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(SLATE_900);
  doc.text(estimate.clientName || "—", leftX, bodyY, { width: colW });
  doc.font("Helvetica").fontSize(10).fillColor(SLATE_600);
  let leftEnd = doc.y;
  if (estimate.clientEmail) {
    doc.text(estimate.clientEmail, leftX, leftEnd, { width: colW });
    leftEnd = doc.y;
  }
  if (estimate.clientPhone) {
    doc.text(estimate.clientPhone, leftX, leftEnd, { width: colW });
    leftEnd = doc.y;
  }

  doc.font("Helvetica").fontSize(10).fillColor(SLATE_600);
  const address = String(estimate.address || "").trim() || "—";
  doc.text(address, rightX, bodyY, { width: colW });
  const rightEnd = doc.y;

  doc.y = Math.max(leftEnd, rightEnd) + 14;
}

function renderLineItemsTable(doc, estimate, pageWidth) {
  drawSectionTitle(doc, "Estimate Summary", pageWidth);

  const tableLeft = doc.page.margins.left;
  const colDescW = pageWidth - 52 - 72 - 72;
  const colQtyW = 52;
  const colUnitW = 72;
  const colTotalW = 72;
  const headerH = 22;

  ensureSpace(doc, headerH + 40);

  const headerY = doc.y;
  doc
    .rect(tableLeft, headerY - 2, pageWidth, headerH)
    .fill(SLATE_100);
  doc.fillColor(SLATE_500).font("Helvetica-Bold").fontSize(8);
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

  const services = Array.isArray(estimate.services) ? estimate.services : [];
  doc.font("Helvetica").fontSize(10).fillColor(SLATE_900);

  if (services.length === 0) {
    doc.fillColor(SLATE_400).text("No line items.", tableLeft + 8);
    doc.fillColor(SLATE_900);
  } else {
    for (const service of services) {
      ensureSpace(doc, 28);
      const rowY = doc.y;
      const qty = Number(service.qty ?? 1) || 1;
      const unit = Number(service.unitPrice ?? service.price ?? 0) || 0;
      const lineTotal = Number(service.price ?? unit * qty) || 0;
      const isDiscount =
        String(service.id || "").toLowerCase() === "discount" || lineTotal < 0;
      const label = displayServiceLineName(service, estimate);

      doc.fillColor(isDiscount ? "#be123c" : SLATE_900);
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
      doc.moveDown(0.45);
      doc
        .strokeColor(SLATE_200)
        .lineWidth(0.5)
        .moveTo(tableLeft, doc.y)
        .lineTo(tableLeft + pageWidth, doc.y)
        .stroke();
      doc.moveDown(0.35);
      doc.fillColor(SLATE_900);
    }
  }

  doc.moveDown(0.4);
}

function renderTotalsBlock(doc, estimate, pageWidth) {
  const tableLeft = doc.page.margins.left;
  const colDescW = pageWidth - 52 - 72 - 72;
  const colQtyW = 52;
  const colUnitW = 72;
  const totalsLabelX = tableLeft + colDescW + colQtyW;
  const totalsValueX = tableLeft + colDescW + colQtyW + colUnitW;
  const colTotalW = 72;

  const renderRow = (label, value, { bold = false, size = 10 } = {}) => {
    ensureSpace(doc, 22);
    const rowY = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
    doc.fillColor(bold ? SLATE_900 : SLATE_500);
    doc.text(label, totalsLabelX, rowY, { width: colUnitW, align: "right" });
    const labelEnd = doc.y;
    doc.fillColor(SLATE_900);
    doc.text(value, totalsValueX, rowY, { width: colTotalW, align: "right" });
    doc.y = Math.max(labelEnd, doc.y) + (bold ? 6 : 4);
  };

  renderRow("Subtotal", formatMoney(estimate.subtotal));
  if (Number(estimate.tax || 0) > 0) {
    renderRow("Tax", formatMoney(estimate.tax));
  }
  doc
    .strokeColor(SLATE_200)
    .lineWidth(1)
    .moveTo(totalsLabelX, doc.y)
    .lineTo(tableLeft + pageWidth, doc.y)
    .stroke();
  doc.moveDown(0.25);
  renderRow("Total", formatMoney(estimate.total), { bold: true, size: 13 });
  doc.moveDown(0.8);
}

function renderScopeSection(doc, estimate, pageWidth) {
  const scopeText = String(estimate.notes || "").trim();
  if (!scopeText) return;

  drawSectionTitle(doc, "Scope of Work", pageWidth);
  const { bullets, paragraphs } = parseScopeOfWorkBlocks(scopeText);

  doc.font("Helvetica").fontSize(10).fillColor(SLATE_600);

  for (const paragraph of paragraphs) {
    ensureSpace(doc, 40);
    doc.text(paragraph, {
      width: pageWidth,
      align: "left",
      lineGap: 4,
    });
    doc.moveDown(0.35);
  }

  if (bullets.length) {
    ensureSpace(doc, 40);
    doc.list(bullets, {
      width: pageWidth - 12,
      bulletRadius: 2,
      textIndent: 10,
      bulletIndent: 8,
      lineGap: 3,
    });
    doc.moveDown(0.4);
  }

  doc.fillColor(SLATE_900);
  doc.moveDown(0.5);
}

function renderPaymentScheduleSection(doc, estimate, pageWidth) {
  const schedule = buildPaymentSchedule(estimate.total);
  if (!schedule || schedule.deposit <= 0) return;

  drawSectionTitle(doc, "Payment Schedule", pageWidth);
  doc.font("Helvetica").fontSize(10).fillColor(SLATE_600);
  const lines = [
    `Deposit (${schedule.depositPercent}%): ${formatMoney(schedule.deposit)}`,
    `Final payment upon completion: ${formatMoney(schedule.finalPayment)}`,
    `Total contract amount: ${formatMoney(schedule.total)}`,
  ];
  for (const line of lines) {
    ensureSpace(doc, 18);
    doc.text(line, { width: pageWidth });
  }
  doc.moveDown(0.6);
}

function renderTermsSection(doc, branding, pageWidth) {
  const sections = mergeTermsSections({ legalFooter: branding.legalFooter });
  drawSectionTitle(doc, "Terms & Conditions", pageWidth);

  for (const section of sections) {
    ensureSpace(doc, 48);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(SLATE_900).text(section.title);
    doc.moveDown(0.15);
    doc.font("Helvetica").fontSize(9).fillColor(SLATE_600).text(section.body, {
      width: pageWidth,
      lineGap: 2,
    });
    doc.moveDown(0.35);
  }
}

function renderAcceptanceSection(doc, pageWidth) {
  drawSectionTitle(doc, "Client Acceptance", pageWidth);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(SLATE_600)
    .text(
      "By signing below, the client accepts this estimate and authorizes the work described above under the stated terms.",
      { width: pageWidth, lineGap: 2 },
    );
  doc.moveDown(0.8);

  const left = doc.page.margins.left;
  const sigW = (pageWidth - 28) / 2;
  const y = doc.y;

  doc.font("Helvetica").fontSize(8).fillColor(SLATE_500);
  doc.text("Client signature", left, y);
  doc.text("Date", left + sigW + 28, y);
  doc.moveDown(0.35);
  const lineY = doc.y;
  doc
    .strokeColor(SLATE_400)
    .lineWidth(0.75)
    .moveTo(left, lineY)
    .lineTo(left + sigW, lineY)
    .stroke();
  doc
    .moveTo(left + sigW + 28, lineY)
    .lineTo(left + pageWidth, lineY)
    .stroke();
  doc.moveDown(1.2);

  doc.text("Printed name", left, doc.y);
  doc.moveDown(0.35);
  const nameLineY = doc.y;
  doc
    .strokeColor(SLATE_400)
    .lineWidth(0.75)
    .moveTo(left, nameLineY)
    .lineTo(left + pageWidth, nameLineY)
    .stroke();
  doc.moveDown(0.6);
}

function renderEstimateFooter(doc, branding, pageWidth) {
  const companyName = String(branding.companyName || "").trim();
  const footerY = doc.page.height - doc.page.margins.bottom - 20;
  doc.font("Helvetica").fontSize(8).fillColor(SLATE_400);
  const website = branding.websiteUrl
    ? String(branding.websiteUrl).replace(/^https?:\/\//i, "")
    : "";
  const parts = [
    companyName || null,
    branding.phone || null,
    branding.email || null,
    website || null,
  ].filter(Boolean);
  doc.text(parts.join("  ·  "), doc.page.margins.left, footerY, {
    width: pageWidth,
    align: "center",
  });
}

/**
 * Build a professional contractor estimate PDF.
 */
export async function buildEstimatePdfBuffer({ estimate, branding = {} }) {
  if (!estimate || !estimate.id) {
    throw new Error("Estimate payload is required to build a PDF");
  }

  const doc = createLetterPdfDocument({
    Title: `Estimate ${estimate.estimateNumber || estimate.id}`,
    Author: branding.companyName || "FieldBase",
    Subject: "Estimate",
  });

  const bufferPromise = bufferFromPdfDocument(doc);

  const metaLines = formatPdfMetaLines(estimate, { includeStatus: false });
  const subtitle = metaLines[0] || "";
  const meta = metaLines.slice(1).join("   |   ");

  const { pageWidth, companyName } = await renderBrandedPdfHeader(doc, {
    title: "Estimate",
    subtitle,
    meta,
    branding,
  });

  renderCompanyContact(doc, branding, pageWidth);
  renderClientAndProject(doc, estimate, pageWidth);
  renderLineItemsTable(doc, estimate, pageWidth);
  renderTotalsBlock(doc, estimate, pageWidth);
  renderScopeSection(doc, estimate, pageWidth);
  renderPaymentScheduleSection(doc, estimate, pageWidth);
  renderTermsSection(doc, branding, pageWidth);
  renderAcceptanceSection(doc, pageWidth);
  renderEstimateFooter(doc, branding, pageWidth);

  doc.end();
  return bufferPromise;
}

export function pdfFilenameForEstimate(estimate) {
  const id = estimate?.estimateNumber || estimate?.id || "estimate";
  const safe = String(id).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "estimate";
  return `${safe}.pdf`;
}

// Re-export for tests that imported helpers from the legacy module.
export { displayServiceLineName, parseScopeOfWorkBlocks } from "./estimate-pdf-content.js";
