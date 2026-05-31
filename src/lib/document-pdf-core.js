import "server-only";
import PDFDocument from "pdfkit";

export function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount) || 0);
}

export function formatDateUtc(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function decodeDataUrlImage(dataUrl) {
  const raw = String(dataUrl || "").trim();
  if (!raw.startsWith("data:")) return null;
  const match = raw.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) return null;
  if (!/^image\/(png|jpe?g)$/i.test(match[1])) return null;
  try {
    const buffer = match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]), "binary");
    return { buffer, mime: match[1] };
  } catch {
    return null;
  }
}

async function fetchRemoteLogoBuffer(url) {
  const raw = String(url || "").trim();
  if (!/^https:\/\//i.test(raw)) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(raw, { signal: controller.signal });
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!/^image\/(png|jpe?g)/.test(contentType)) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 1_500_000) return null;
    return { buffer: Buffer.from(arrayBuffer), mime: contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function placementToAlign(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "top_right") return "right";
  if (normalized === "top_center") return "center";
  return "left";
}

export async function resolveLogoBuffer(logoUrl) {
  const raw = String(logoUrl || "").trim();
  if (raw.startsWith("data:")) return decodeDataUrlImage(raw);
  if (/^https:\/\//i.test(raw)) return fetchRemoteLogoBuffer(raw);
  return null;
}

/**
 * Render branded header band; mutates doc cursor.
 */
export async function renderBrandedPdfHeader(doc, { title, subtitle = "", meta = "", branding = {} }) {
  const companyName = String(branding.companyName || "").trim();
  const logoBuffer = await resolveLogoBuffer(branding.logoUrl);
  const align = placementToAlign(branding.logoPlacement);
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const headerTop = doc.y;

  if (logoBuffer?.buffer) {
    const logoWidth = 110;
    let logoX = doc.page.margins.left;
    if (align === "right") logoX = doc.page.margins.left + pageWidth - logoWidth;
    else if (align === "center") logoX = doc.page.margins.left + (pageWidth - logoWidth) / 2;
    try {
      doc.image(logoBuffer.buffer, logoX, headerTop, { fit: [logoWidth, 60] });
    } catch {
      /* skip */
    }
    doc.y = headerTop + 70;
  }

  if (companyName) {
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text(companyName, { align });
    doc.moveDown(0.35);
  }

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a").text(title, { align: "left" });
  if (subtitle) doc.font("Helvetica").fontSize(11).fillColor("#475569").text(subtitle);
  if (meta) doc.font("Helvetica").fontSize(10).fillColor("#64748b").text(meta);
  doc.moveDown(0.8);
  doc
    .strokeColor("#e2e8f0")
    .lineWidth(1)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + pageWidth, doc.y)
    .stroke();
  doc.moveDown(0.7);

  return { pageWidth, companyName };
}

export function renderPdfFooter(doc, companyName) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const footerY = doc.page.height - doc.page.margins.bottom - 24;
  doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
  doc.text(
    `Generated on ${formatDateUtc(new Date().toISOString())}${companyName ? `  ·  ${companyName}` : ""}`,
    doc.page.margins.left,
    footerY,
    { width: pageWidth, align: "center" },
  );
}

export function createLetterPdfDocument(info) {
  return new PDFDocument({
    size: "LETTER",
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info,
  });
}

export function bufferFromPdfDocument(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export function pdfSafeFilename(prefix, id) {
  const safe = String(id || prefix).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || prefix;
  return `${safe}.pdf`;
}

export function pdfResponse(buffer, filename, { download = false } = {}) {
  const disposition = download ? "attachment" : "inline";
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
