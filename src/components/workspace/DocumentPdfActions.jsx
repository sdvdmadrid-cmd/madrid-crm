"use client";

import ws from "@/styles/workspace-dark.module.css";

/**
 * Standard Print + Download PDF actions for contractor documents.
 *
 * @param {{ pdfUrl: string, downloadUrl?: string, printLabel?: string, downloadLabel?: string, className?: string }} props
 */
export default function DocumentPdfActions({
  pdfUrl,
  downloadUrl,
  printLabel = "Print",
  downloadLabel = "Download PDF",
  className = "",
}) {
  if (!pdfUrl) return null;

  const downloadHref = downloadUrl || `${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}download=1`;

  return (
    <div
      className={className}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
    >
      <a
        href={pdfUrl}
        target="_blank"
        rel="noreferrer"
        title="Opens PDF — use your browser Print dialog to print or Save as PDF"
        aria-label={`${printLabel} document`}
        className={ws.btnSecondary}
        style={{ textDecoration: "none", textAlign: "center" }}
      >
        {printLabel}
      </a>
      <a
        href={downloadHref}
        target="_blank"
        rel="noreferrer"
        download
        aria-label={`${downloadLabel}`}
        className={ws.btnSecondary}
        style={{ textDecoration: "none", textAlign: "center" }}
      >
        {downloadLabel}
      </a>
    </div>
  );
}
