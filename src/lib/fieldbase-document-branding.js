/**
 * FieldBase product branding for customer-facing documents (invoices).
 * Client-safe — no PDF / server-only imports.
 */

export const FIELDBASE_PRODUCT_NAME = "FieldBase";

/** Public marketing site — not the tenant app URL (localhost in dev). */
export const FIELDBASE_WEBSITE_URL = String(
  process.env.NEXT_PUBLIC_FIELDBASE_URL || "https://fieldbaseapp.net",
).trim();

export function getFieldBasePoweredByLabel() {
  return `Powered by ${FIELDBASE_PRODUCT_NAME}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML footer block for browser print and invoice emails. */
export function buildFieldBasePoweredByHtml({ includeLink = true } = {}) {
  const label = escapeHtml(getFieldBasePoweredByLabel());
  const url = escapeHtml(FIELDBASE_WEBSITE_URL);
  const inner = includeLink
    ? `<a href="${url}" style="color:#64748b;text-decoration:none;font-weight:600;">${label}</a>`
    : `<span style="font-weight:600;">${label}</span>`;

  return `<p style="margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;font-family:Arial,sans-serif;">${inner}</p>`;
}

export function appendFieldBasePoweredByText(text = "") {
  const base = String(text || "").trimEnd();
  const line = `${getFieldBasePoweredByLabel()} — ${FIELDBASE_WEBSITE_URL}`;
  return base ? `${base}\n\n${line}` : line;
}
