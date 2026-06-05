import "server-only";

import {
  bufferFromPdfDocument,
  createLetterPdfDocument,
  formatDateUtc,
  formatMoney,
  renderBrandedPdfHeader,
  renderPdfFooter,
} from "./document-pdf-core.js";

export async function buildW2PdfBuffer({ branding = {}, employer = {}, employee = {}, year, ytd = {} }) {
  const doc = createLetterPdfDocument({
    Title: `W-2 ${year} — ${employee.fullName || "Employee"}`,
    Author: branding.companyName || "FieldBase",
  });

  await renderBrandedPdfHeader(doc, {
    title: `Form W-2 — ${year}`,
    subtitle: "Wage and Tax Statement",
    meta: `Employee: ${employee.fullName || ""}`,
    branding,
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font("Helvetica-Bold").fontSize(10).text("Employer");
  doc.font("Helvetica").fontSize(10);
  doc.text(employer.employerLegalName || branding.companyName || "");
  if (branding.businessAddress) doc.text(branding.businessAddress);

  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(10).text("Employee");
  doc.font("Helvetica").fontSize(10);
  doc.text(employee.fullName || "");
  if (employee.addressStreet) {
    doc.text(
      [employee.addressStreet, employee.addressCity, employee.addressState, employee.addressZip]
        .filter(Boolean)
        .join(", "),
    );
  }
  if (employee.ssnLast4) doc.text(`SSN ending •••• ${employee.ssnLast4}`);

  doc.moveDown(0.8);
  const rows = [
    ["Box 1 — Wages, tips, other compensation", ytd.grossPay],
    ["Box 2 — Federal income tax withheld", ytd.federalWithholding],
    ["Box 3 — Social Security wages", ytd.grossPay],
    ["Box 4 — Social Security tax withheld", ytd.socialSecurity],
    ["Box 5 — Medicare wages and tips", ytd.grossPay],
    ["Box 6 — Medicare tax withheld", ytd.medicare],
    ["Box 17 — State income tax", ytd.stateWithholding],
  ];

  doc.font("Helvetica-Bold").fontSize(11).text("W-2 Summary");
  doc.moveDown(0.3);
  for (const [label, amount] of rows) {
    doc.font("Helvetica").fontSize(10).text(label, { continued: true });
    doc.text(formatMoney(amount || 0), { align: "right", width: pageWidth });
  }

  renderPdfFooter(doc, branding.companyName || "");
  doc.end();
  return bufferFromPdfDocument(doc);
}

export async function build1099PdfBuffer({ branding = {}, payer = {}, contractor = {}, year, ytd = {} }) {
  const doc = createLetterPdfDocument({
    Title: `1099-NEC ${year} — ${contractor.fullName || "Contractor"}`,
  });

  await renderBrandedPdfHeader(doc, {
    title: `Form 1099-NEC — ${year}`,
    subtitle: "Nonemployee Compensation",
    branding,
  });

  doc.font("Helvetica").fontSize(10);
  doc.text(`Payer: ${payer.employerLegalName || branding.companyName || ""}`);
  doc.text(`Recipient: ${contractor.fullName || ""}`);
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").text(`Box 1 — Nonemployee compensation: ${formatMoney(ytd.grossPay || 0)}`);

  renderPdfFooter(doc, branding.companyName || "");
  doc.end();
  return bufferFromPdfDocument(doc);
}

export function pdfFilenameForW2({ employee, year }) {
  const name = String(employee?.lastName || "employee").replace(/[^a-z0-9_-]+/gi, "_");
  return `W2_${name}_${year}.pdf`;
}
