import {
  bufferFromPdfDocument,
  createLetterPdfDocument,
  formatDateUtc,
  formatMoney,
  renderBrandedPdfHeader,
  renderPdfFooter,
} from "./document-pdf-core.js";

export async function buildJobPdfBuffer({ job, branding = {} }) {
  if (!job?.id && !job?._id) {
    throw new Error("Job payload is required");
  }

  const doc = createLetterPdfDocument({
    Title: `Work Order ${job.title || job.id}`,
    Author: branding.companyName || "FieldBase",
    Subject: "Work Order",
  });

  const bufferPromise = bufferFromPdfDocument(doc);

  const meta = [
    job.status ? `Status: ${job.status}` : null,
    job.dueDate ? `Due: ${formatDateUtc(job.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join("   |   ");

  const { pageWidth, companyName } = await renderBrandedPdfHeader(doc, {
    title: "Work Order",
    subtitle: job.title || "",
    meta,
    branding,
  });

  const rows = [
    ["Client", job.clientName],
    ["Service", job.service],
    ["Price", formatMoney(job.price)],
    ["Tax state", job.taxState],
    ["Down payment %", job.downPaymentPercent],
  ];

  doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
  for (const [label, value] of rows) {
    if (value === undefined || value === null || value === "") continue;
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(String(value));
  }

  if (job.scopeDetails) {
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).text("Scope of Work");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#475569").text(String(job.scopeDetails), {
      width: pageWidth,
      lineGap: 2,
    });
  }

  renderPdfFooter(doc, companyName);
  doc.end();
  return bufferPromise;
}

export function pdfFilenameForJob(job) {
  const safe = String(job?.title || job?.id || job?._id || "work-order")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 60);
  return `${safe || "work-order"}.pdf`;
}
