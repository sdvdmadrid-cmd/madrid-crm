/**
 * CSV export helpers — Jobber-friendly columns for round-trip import.
 */

export const CLIENT_EXPORT_HEADERS = [
  "First Name",
  "Last Name",
  "Company",
  "Email",
  "Mobile Phone",
  "Street 1",
  "City",
  "State",
  "ZIP",
  "Notes",
];

export function encodeCsvCell(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes("\r") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function splitClientName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * @param {object} client serialized client row
 * @returns {string[]}
 */
export function clientToExportCells(client = {}) {
  const { firstName, lastName } = splitClientName(client.name);
  return [
    firstName,
    lastName,
    client.company || client.companyName || "",
    client.email || "",
    client.phone || "",
    client.address || "",
    client.city || "",
    client.state || "",
    client.zip || client.zipCode || "",
    client.notes || "",
  ];
}

/**
 * @param {object[]} clients
 * @returns {string}
 */
export function buildClientsExportCsv(clients = []) {
  const lines = [CLIENT_EXPORT_HEADERS.map(encodeCsvCell).join(",")];
  for (const client of clients) {
    lines.push(clientToExportCells(client).map(encodeCsvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

/**
 * Trigger a CSV download in the browser.
 */
export function downloadCsvFile(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
