/**
 * Open a minimal HTML document in a new window and trigger the browser print
 * dialog. Contractors use this for invoices, receipts, job summaries, and
 * contract text when no server-side PDF exists yet.
 */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {{ title: string, bodyHtml: string, autoPrint?: boolean }} options
 * @returns {boolean} false when popups are blocked
 */
export function openPrintableHtmlDocument({ title, bodyHtml, autoPrint = true }) {
  if (typeof window === "undefined") return false;

  const popup = window.open(
    "",
    "_blank",
    "noopener,noreferrer,width=840,height=960",
  );
  if (!popup) return false;

  const safeTitle = escapeHtml(title || "Document");
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; padding: 28px 32px; color: #1e293b; line-height: 1.45; }
    h1 { font-size: 22px; margin: 0 0 8px; font-family: Arial, sans-serif; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 20px; font-family: Arial, sans-serif; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-family: Arial, sans-serif; font-size: 14px; }
    th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; width: 32%; font-weight: 600; }
    pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px; margin: 0; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`);
  popup.document.close();
  popup.focus();
  if (autoPrint) {
    popup.addEventListener("load", () => popup.print(), { once: true });
    window.setTimeout(() => {
      try {
        popup.print();
      } catch {
        /* ignore */
      }
    }, 320);
  }
  return true;
}
