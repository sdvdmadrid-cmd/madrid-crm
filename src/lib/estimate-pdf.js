import "server-only";
import PDFDocument from "pdfkit";

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount) || 0);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_LABEL = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  declined: "Declined",
  changes_requested: "Changes Requested",
};

/**
 * Decode a data: URL into { buffer, mimeType } so pdfkit can embed it.
 * pdfkit supports PNG and JPG. SVG is not natively supported here, so we
 * fall back to skipping the logo if the mime indicates SVG.
 */
function decodeDataUrlImage(dataUrl) {
  const raw = String(dataUrl || "").trim();
  if (!raw.startsWith("data:")) return null;
  const match = raw.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  if (!/^image\/(png|jpe?g)$/.test(mime)) return null;
  try {
    const buffer = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "binary");
    return { buffer, mime };
  } catch {
    return null;
  }
}

/**
 * Fetch a remote logo and return its bytes if it's a PNG/JPEG. Returns
 * null on any failure (network, timeout, unsupported mime, oversize).
 * The PDF flow falls back to the company name only.
 */
async function fetchRemoteLogoBuffer(url) {
  const raw = String(url || "").trim();
  if (!/^https:\/\//i.test(raw)) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(raw, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "")
      .toLowerCase()
      .split(";")[0]
      .trim();
    if (!/^image\/(png|jpe?g)$/.test(contentType)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    // Cap to 800 KB so a malicious or absurdly large logo can't OOM the
    // serverless function.
    if (buffer.byteLength > 800 * 1024) return null;
    return { buffer, mime: contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveLogoBuffer(logoUrl) {
  if (!logoUrl) return null;
  const dataUrl = decodeDataUrlImage(logoUrl);
  if (dataUrl) return dataUrl;
  return fetchRemoteLogoBuffer(logoUrl);
}

function placementToAlign(placement) {
  const value = String(placement || "").toLowerCase();
  if (value === "top_right") return "right";
  if (value === "top_center") return "center";
  return "left";
}

/**
 * Build a PDF estimate document and resolve with a Buffer.
 *
 * The layout intentionally matches the public estimate page so the
 * customer sees the same totals and branding both in browser and PDF.
 * Failure modes:
 *   - Logo can't be fetched → drop silently, keep the rest of the doc.
 *   - Services array missing/empty → render a friendly "No line items".
 *   - All other errors propagate to the caller (the route returns 500).
 */
export async function buildEstimatePdfBuffer({ estimate, branding = {} }) {
  if (!estimate || !estimate.id) {
    throw new Error("Estimate payload is required to build a PDF");
  }

  const companyName = String(branding.companyName || "").trim();
  const logoBuffer = await resolveLogoBuffer(branding.logoUrl);
  const align = placementToAlign(branding.logoPlacement);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 56, bottom: 56, left: 56, right: 56 },
        info: {
          Title: `Estimate ${estimate.estimateNumber || estimate.id}`,
          Author: companyName || "FieldBase",
          Subject: "Estimate",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // --- Header band (logo + company name) -----------------------------
      const headerTop = doc.y;
      if (logoBuffer && logoBuffer.buffer) {
        const logoWidth = 110;
        let logoX = doc.page.margins.left;
        if (align === "right") {
          logoX = doc.page.margins.left + pageWidth - logoWidth;
        } else if (align === "center") {
          logoX = doc.page.margins.left + (pageWidth - logoWidth) / 2;
        }
        try {
          doc.image(logoBuffer.buffer, logoX, headerTop, {
            fit: [logoWidth, 60],
            align: "left",
            valign: "top",
          });
        } catch {
          // Bad logo bytes — silently skip.
        }
        doc.y = headerTop + 70;
      }

      if (companyName) {
        doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a");
        doc.text(companyName, { align });
        doc.moveDown(0.4);
      }

      doc.font("Helvetica-Bold").fontSize(22).fillColor("#0f172a");
      doc.text("Estimate", { align: "left" });
      doc.font("Helvetica").fontSize(10).fillColor("#475569");
      const meta = [
        estimate.estimateNumber ? `# ${estimate.estimateNumber}` : null,
        estimate.createdAt ? `Date: ${formatDate(estimate.createdAt)}` : null,
        STATUS_LABEL[String(estimate.status || "draft").toLowerCase()]
          ? `Status: ${STATUS_LABEL[String(estimate.status || "draft").toLowerCase()]}`
          : null,
      ]
        .filter(Boolean)
        .join("   |   ");
      if (meta) doc.text(meta);
      doc.moveDown(1);

      doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).stroke();
      doc.moveDown(0.6);

      // --- Customer block ------------------------------------------------
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Bill To");
      doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
      doc.text(estimate.clientName || "—");
      if (estimate.clientEmail) doc.fillColor("#475569").text(estimate.clientEmail).fillColor("#0f172a");
      if (estimate.clientPhone) doc.fillColor("#475569").text(estimate.clientPhone).fillColor("#0f172a");
      if (estimate.address) {
        doc.moveDown(0.3);
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Service Address");
        doc.font("Helvetica").fontSize(10).fillColor("#475569").text(estimate.address);
        doc.fillColor("#0f172a");
      }
      doc.moveDown(0.8);

      // --- Line items table ---------------------------------------------
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Line Items");
      doc.moveDown(0.3);

      const tableLeft = doc.page.margins.left;
      const colDescW = pageWidth - 90 - 80 - 80;
      const colQtyW = 60;
      const colUnitW = 80;
      const colTotalW = 80;

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
      const headerY = doc.y;
      doc.text("Description", tableLeft, headerY, { width: colDescW });
      doc.text("Qty", tableLeft + colDescW, headerY, { width: colQtyW, align: "right" });
      doc.text("Unit Price", tableLeft + colDescW + colQtyW, headerY, { width: colUnitW, align: "right" });
      doc.text("Total", tableLeft + colDescW + colQtyW + colUnitW, headerY, { width: colTotalW, align: "right" });
      doc.moveDown(0.4);
      doc.strokeColor("#cbd5e1").lineWidth(0.5).moveTo(tableLeft, doc.y).lineTo(tableLeft + pageWidth, doc.y).stroke();
      doc.moveDown(0.4);

      const services = Array.isArray(estimate.services) ? estimate.services : [];
      doc.font("Helvetica").fontSize(10).fillColor("#0f172a");

      if (services.length === 0) {
        doc.fillColor("#94a3b8").text("No line items.", { align: "left" });
        doc.fillColor("#0f172a");
      } else {
        for (const service of services) {
          const rowY = doc.y;
          const qty = Number(service.qty ?? 1) || 1;
          const unit = Number(service.unitPrice ?? service.price ?? 0) || 0;
          const lineTotal = Number(service.price ?? unit * qty) || 0;
          const isDiscount = String(service.id || "").toLowerCase() === "discount" || lineTotal < 0;

          doc.fillColor(isDiscount ? "#be123c" : "#0f172a");
          doc.text(String(service.name || "Service"), tableLeft, rowY, { width: colDescW });
          doc.text(String(qty), tableLeft + colDescW, rowY, { width: colQtyW, align: "right" });
          doc.text(formatMoney(unit), tableLeft + colDescW + colQtyW, rowY, { width: colUnitW, align: "right" });
          doc.text(formatMoney(lineTotal), tableLeft + colDescW + colQtyW + colUnitW, rowY, { width: colTotalW, align: "right" });
          doc.moveDown(0.3);
          doc.fillColor("#0f172a");
        }
      }

      doc.moveDown(0.5);
      doc.strokeColor("#cbd5e1").lineWidth(0.5).moveTo(tableLeft, doc.y).lineTo(tableLeft + pageWidth, doc.y).stroke();
      doc.moveDown(0.6);

      // --- Totals --------------------------------------------------------
      const totalsLabelX = tableLeft + colDescW + colQtyW;
      const totalsValueX = tableLeft + colDescW + colQtyW + colUnitW;

      doc.font("Helvetica").fontSize(10).fillColor("#475569");
      doc.text("Subtotal", totalsLabelX, doc.y, { width: colUnitW, align: "right" });
      doc.fillColor("#0f172a").text(formatMoney(estimate.subtotal), totalsValueX, doc.y, { width: colTotalW, align: "right" });
      doc.moveDown(0.2);

      if (Number(estimate.tax || 0) > 0) {
        doc.fillColor("#475569").text("Tax", totalsLabelX, doc.y, { width: colUnitW, align: "right" });
        doc.fillColor("#0f172a").text(formatMoney(estimate.tax), totalsValueX, doc.y, { width: colTotalW, align: "right" });
        doc.moveDown(0.2);
      }

      doc.font("Helvetica-Bold").fontSize(12);
      doc.fillColor("#0f172a").text("Total", totalsLabelX, doc.y, { width: colUnitW, align: "right" });
      doc.text(formatMoney(estimate.total), totalsValueX, doc.y, { width: colTotalW, align: "right" });
      doc.font("Helvetica").fontSize(10);
      doc.moveDown(1.2);

      // --- Notes / scope of work ----------------------------------------
      if (estimate.notes) {
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Scope of Work", tableLeft);
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(10).fillColor("#475569").text(String(estimate.notes), {
          width: pageWidth,
          align: "left",
          lineGap: 2,
        });
        doc.fillColor("#0f172a");
        doc.moveDown(0.8);
      }

      // --- Footer -------------------------------------------------------
      const footerY = doc.page.height - doc.page.margins.bottom - 24;
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
      doc.text(
        `Generated on ${formatDate(new Date().toISOString())}${companyName ? `  ·  ${companyName}` : ""}`,
        doc.page.margins.left,
        footerY,
        { width: pageWidth, align: "center" },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function pdfFilenameForEstimate(estimate) {
  const id = estimate?.estimateNumber || estimate?.id || "estimate";
  const safe = String(id).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "estimate";
  return `${safe}.pdf`;
}
