/**
 * Pure helpers for estimate PDF copy and layout (no pdfkit / server deps).
 */

const BASE_PRICE_IDS = new Set(["base_price", "base-price", "baseprice"]);
const BASE_PRICE_LABEL = /^base\s*price$/i;

export const DEFAULT_VALIDITY_DAYS = 30;
export const DEFAULT_DEPOSIT_PERCENT = 50;

export function deriveServiceTitleFromScope(noteText, explicitTitle = "") {
  const explicit = String(explicitTitle || "").trim();
  if (explicit.length >= 3) return explicit.slice(0, 120);

  const firstLine = String(noteText || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•*]\s+/, ""))
    .find((line) => line.length >= 3);

  if (!firstLine || firstLine.length > 120) return "";
  if (/^(scope|notes|description)\s*:/i.test(firstLine)) return "";
  return firstLine;
}

export function displayServiceLineName(service, estimate = {}) {
  const id = String(service?.id || "").toLowerCase();
  const rawName = String(service?.name || "").trim();
  const isBase =
    BASE_PRICE_IDS.has(id) || BASE_PRICE_LABEL.test(rawName) || !rawName;

  if (!isBase) return rawName || "Service";

  const fromEstimate =
    estimate.serviceTitle ||
    deriveServiceTitleFromScope(estimate.notes, "");
  return fromEstimate || "Professional Services";
}

/**
 * Split scope text into bullet items and plain paragraphs for PDF rendering.
 */
export function parseScopeOfWorkBlocks(noteText) {
  const text = String(noteText || "").trim();
  if (!text) return { bullets: [], paragraphs: [] };

  const lines = text.split(/\r?\n/);
  const bullets = [];
  const paragraphLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bulletMatch = trimmed.match(
      /^(?:[-•*]|\d+[.)])\s+(.+)$/,
    );
    if (bulletMatch) {
      bullets.push(bulletMatch[1].trim());
    } else {
      paragraphLines.push(trimmed);
    }
  }

  const paragraphs = [];
  let buffer = [];
  for (const line of paragraphLines) {
    if (/^[-•*]\s/.test(line)) {
      if (buffer.length) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
      bullets.push(line.replace(/^[-•*]\s+/, "").trim());
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) paragraphs.push(buffer.join(" "));

  return { bullets, paragraphs };
}

export function addDaysUtc(isoDate, days) {
  const base = isoDate ? new Date(isoDate) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + Math.max(0, Number(days) || 0));
  return out.toISOString();
}

export function buildDefaultTerms({ validityDays = DEFAULT_VALIDITY_DAYS } = {}) {
  return [
    {
      title: "Deposit",
      body: "A deposit may be required to secure scheduling. Work begins after the deposit is received unless otherwise agreed in writing.",
    },
    {
      title: "Payment terms",
      body: "Balance is due upon substantial completion unless a payment schedule is listed above. Late balances may incur reasonable collection costs where permitted by law.",
    },
    {
      title: "Additional work",
      body: "Work outside this scope requires written approval. Additional labor, materials, permits, or disposal are billed separately.",
    },
    {
      title: "Proposal validity",
      body: `This estimate is valid for ${validityDays} days from the date shown. Pricing may change after expiration due to material or labor costs.`,
    },
  ];
}

export function mergeTermsSections({ legalFooter = "", validityDays } = {}) {
  const sections = buildDefaultTerms({ validityDays });
  const custom = String(legalFooter || "").trim();
  if (custom) {
    sections.push({
      title: "Additional terms",
      body: custom,
    });
  }
  return sections;
}

export function buildPaymentSchedule(total, { depositPercent = DEFAULT_DEPOSIT_PERCENT } = {}) {
  const amount = Math.max(0, Number(total) || 0);
  if (amount <= 0) return null;

  const pct = Math.min(100, Math.max(0, Number(depositPercent) || 0));
  const deposit = Math.round(amount * (pct / 100) * 100) / 100;
  const finalPayment = Math.round((amount - deposit) * 100) / 100;

  return {
    depositPercent: pct,
    deposit,
    finalPayment,
    total: amount,
  };
}

export function formatPdfMetaLines(estimate, { includeStatus = false } = {}) {
  const lines = [];
  if (estimate.estimateNumber) lines.push(`Estimate #${estimate.estimateNumber}`);
  if (estimate.createdAt) {
    lines.push(`Date: ${formatShortDate(estimate.createdAt)}`);
  }
  const validUntil = addDaysUtc(estimate.createdAt, DEFAULT_VALIDITY_DAYS);
  lines.push(`Valid through: ${formatShortDate(validUntil)}`);

  if (includeStatus) {
    const status = String(estimate.status || "").toLowerCase();
    if (status && status !== "draft") {
      const label =
        {
          sent: "Sent",
          approved: "Approved",
          declined: "Declined",
          changes_requested: "Changes requested",
        }[status] || status;
      lines.push(`Status: ${label}`);
    }
  }

  return lines;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
