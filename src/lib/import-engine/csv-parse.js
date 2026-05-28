/**
 * Lightweight RFC 4180-style CSV parser (no external deps).
 * Handles UTF-8 BOM, quoted fields, escaped quotes, and CRLF/LF newlines.
 */

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_CSV_ROWS = 10_000;

export { MAX_CSV_BYTES, MAX_CSV_ROWS };

export function stripUtf8Bom(text) {
  const raw = String(text || "");
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/**
 * @returns {{ headers: string[], rows: Record<string, string>[], truncated: boolean, totalParsed: number }}
 */
export function parseCsvText(text, { maxRows = MAX_CSV_ROWS } = {}) {
  const cleaned = stripUtf8Bom(text);
  if (!cleaned.trim()) {
    return { headers: [], rows: [], truncated: false, totalParsed: 0 };
  }

  const records = parseCsvRecords(cleaned);
  if (!records.length) {
    return { headers: [], rows: [], truncated: false, totalParsed: 0 };
  }

  const headerRow = records[0].map((cell) => String(cell || "").trim());
  const headers = headerRow.map((h, index) => h || `Column ${index + 1}`);
  const dataRows = records.slice(1);
  const truncated = dataRows.length > maxRows;
  const limited = truncated ? dataRows.slice(0, maxRows) : dataRows;

  const rows = limited.map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = String(cells[index] ?? "").trim();
    });
    return record;
  });

  return {
    headers,
    rows,
    truncated,
    totalParsed: dataRows.length,
  };
}

function parseCsvRecords(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      if (row.some((cell) => String(cell).trim() !== "")) {
        rows.push(row);
      }
      row = [];
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}
