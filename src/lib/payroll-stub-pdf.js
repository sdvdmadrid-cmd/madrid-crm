import "server-only";

import {
  bufferFromPdfDocument,
  createLetterPdfDocument,
  formatDateUtc,
  formatMoney,
  renderBrandedPdfHeader,
  renderPdfFooter,
} from "./document-pdf-core.js";

function formatAddress(employee = {}) {
  const parts = [
    employee.addressStreet,
    [employee.addressCity, employee.addressState, employee.addressZip]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);
  return parts.join("\n");
}

function renderMoneyRow(doc, label, amount, { bold = false, indent = 0 } = {}) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left + indent;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(10)
    .fillColor(bold ? "#0f172a" : "#334155");
  doc.text(label, left, doc.y, { width: pageWidth * 0.65, continued: false });
  const y = doc.y - 12;
  doc.text(formatMoney(amount), left, y, {
    width: pageWidth,
    align: "right",
  });
  doc.moveDown(0.35);
}

function renderSectionTitle(doc, title) {
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(title);
  doc.moveDown(0.25);
}

function formatPayFrequencyLabel(scheduleType) {
  const map = {
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    semimonthly: "Semi-monthly",
    monthly: "Monthly",
  };
  return map[String(scheduleType || "").toLowerCase()] || "Bi-weekly";
}

/**
 * Build a professional pay stub PDF buffer.
 */
export async function buildPayStubPdfBuffer({
  branding = {},
  employer = {},
  employee = {},
  run = {},
  item = {},
}) {
  const doc = createLetterPdfDocument({
    Title: `Pay Stub — ${employee.fullName || "Employee"}`,
    Author: branding.companyName || "FieldBase",
  });

  const deductions = item.deductions || {};
  const employerTaxes = item.employerTaxes || {};
  const ytd = item.ytdSnapshot || {};
  const settingsApplied = item.stubSnapshot?.settingsApplied || {};
  const payFrequency = formatPayFrequencyLabel(run.scheduleType);

  await renderBrandedPdfHeader(doc, {
    title: "Pay Stub",
    subtitle: run.title || "Pay Period",
    meta: `Pay date: ${formatDateUtc(run.payDate)}  ·  Period: ${formatDateUtc(run.periodStart)} – ${formatDateUtc(run.periodEnd)}  ·  Pay frequency: ${payFrequency}`,
    branding,
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#64748b").text("EMPLOYER");
  doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
  doc.text(employer.employerLegalName || branding.companyName || "");
  if (branding.businessAddress) doc.text(branding.businessAddress);
  if (branding.phone) doc.text(branding.phone);

  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#64748b").text("EMPLOYEE");
  doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
  doc.text(employee.fullName || `${employee.firstName || ""} ${employee.lastName || ""}`.trim());
  const address = formatAddress(employee);
  if (address) doc.text(address);
  if (employee.email) doc.text(employee.email);
  if (employee.ssnLast4) doc.text(`SSN ending •••• ${employee.ssnLast4}`);
  doc.text(`Tax form: ${String(employee.taxForm || "w2").toUpperCase()}`);
  if (employee.workState) doc.text(`Work state: ${employee.workState}`);

  renderSectionTitle(doc, "Earnings");
  renderMoneyRow(doc, "Regular hours", item.hoursRegular || 0, { indent: 0 });
  if (Number(item.hoursOvertime || 0) > 0) {
    renderMoneyRow(doc, "Overtime hours", item.hoursOvertime);
  }
  if (Number(item.ptoHours || 0) > 0) {
    renderMoneyRow(doc, "PTO hours", item.ptoHours);
  }
  if (Number(item.sickHours || 0) > 0) {
    renderMoneyRow(doc, "Sick hours", item.sickHours);
  }
  renderMoneyRow(doc, "Hourly rate", item.hourlyRate || employee.hourlyRate || 0);
  renderMoneyRow(doc, "Gross pay", item.grossPay || 0, { bold: true });
  if (settingsApplied.standardWeeklyHours) {
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    doc.text(
      `Hourly estimates use ${settingsApplied.standardWeeklyHours} standard weekly hours from your payroll settings.`,
    );
    doc.moveDown(0.25);
  }

  renderSectionTitle(doc, "Employee taxes & deductions");
  renderMoneyRow(doc, "Federal income tax", deductions.federalWithholding || 0);
  renderMoneyRow(doc, "State income tax", deductions.stateWithholding || 0);
  renderMoneyRow(doc, "Social Security", deductions.socialSecurity || 0);
  renderMoneyRow(doc, "Medicare", deductions.medicare || 0);
  if (Number(deductions.additional || 0) > 0) {
    renderMoneyRow(doc, "Other deductions", deductions.additional || 0);
  }
  renderMoneyRow(doc, "Net pay", item.netPay || 0, { bold: true });

  renderSectionTitle(doc, "Employer taxes (informational)");
  renderMoneyRow(doc, "Employer Social Security", employerTaxes.socialSecurity || 0);
  renderMoneyRow(doc, "Employer Medicare", employerTaxes.medicare || 0);
  renderMoneyRow(doc, "FUTA", employerTaxes.futa || 0);
  renderMoneyRow(doc, "SUTA", employerTaxes.suta || 0);
  renderMoneyRow(doc, "Total employer taxes", employerTaxes.total || 0, { bold: true });

  renderSectionTitle(doc, "Year-to-date");
  renderMoneyRow(doc, "YTD gross", ytd.grossPay || 0);
  renderMoneyRow(doc, "YTD federal", ytd.federalWithholding || 0);
  renderMoneyRow(doc, "YTD state", ytd.stateWithholding || 0);
  renderMoneyRow(doc, "YTD Social Security", ytd.socialSecurity || 0);
  renderMoneyRow(doc, "YTD Medicare", ytd.medicare || 0);
  renderMoneyRow(doc, "YTD net pay", ytd.netPay || 0, { bold: true });

  if (employee.hasDirectDeposit) {
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    doc.text(
      `Direct deposit to account ending •••• ${employee.directDepositLast4 || "****"}`,
      doc.page.margins.left,
      doc.y,
      { width: pageWidth },
    );
  }

  renderPdfFooter(doc, branding.companyName || employer.employerLegalName || "");
  doc.end();
  return bufferFromPdfDocument(doc);
}

export function pdfFilenameForPayStub({ employee, run, item }) {
  const name = String(employee?.lastName || employee?.fullName || "employee")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 40);
  const date = String(run?.payDate || "").slice(0, 10) || "stub";
  const id = String(item?.id || "").slice(0, 8);
  return `pay-stub_${name}_${date}_${id}.pdf`;
}
