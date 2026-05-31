/**
 * Shared client-side search: tokenize, score, rank list rows (leads, bills, admin tables).
 */

export function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ");
}

export function tokenizeSearchText(raw) {
  const normalized = normalizeSearchText(raw);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function scoreTokenAgainstField(token, fieldValue, weights) {
  const field = normalizeSearchText(fieldValue);
  if (!field || !token) return 0;

  const { exact = 1000, prefix = 500, wordPrefix = 350, contains = 180 } = weights;

  if (field === token) return exact;
  if (field.startsWith(token)) return prefix;
  if (field.split(" ").some((word) => word.startsWith(token))) return wordPrefix;
  if (field.includes(token)) return contains;
  return 0;
}

/**
 * Score a record from an ordered list of field values (first = highest priority).
 */
export function scoreRecordSearch(record, query, getFieldValues) {
  const tokens = tokenizeSearchText(query);
  if (!tokens.length) return 0;

  const values =
    typeof getFieldValues === "function"
      ? getFieldValues(record)
      : getFieldValues;
  const fields = (Array.isArray(values) ? values : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  if (!fields.length) return 0;

  const primary = fields[0];
  const secondary = fields.slice(1).join(" ");
  const fullHaystack = fields.join(" ");
  const qFull = tokens.join(" ");

  let total = 0;

  for (const token of tokens) {
    let best = 0;

    best = Math.max(
      best,
      scoreTokenAgainstField(token, primary, {
        exact: 1000,
        prefix: 520,
        wordPrefix: 380,
        contains: 220,
      }),
    );

    if (secondary) {
      best = Math.max(
        best,
        scoreTokenAgainstField(token, secondary, {
          exact: 800,
          prefix: 420,
          wordPrefix: 300,
          contains: 160,
        }),
      );
    }

    if (fullHaystack.includes(token)) {
      best = Math.max(best, 60);
    }

    if (token.length <= 2 && best > 0 && best < 100) {
      best = 0;
    }

    if (best === 0) return 0;
    total += best;
  }

  if (tokens.length > 1) {
    if (normalizeSearchText(primary).includes(qFull)) total += 90;
    else if (fullHaystack.includes(qFull)) total += 40;
  }

  return total;
}

/**
 * Filter to matching rows and sort by relevance (highest first).
 */
export function filterAndRankRecords(records, query, getFieldValues) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return records || [];

  return [...(records || [])]
    .map((record) => ({
      record,
      score: scoreRecordSearch(record, trimmed, getFieldValues),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.record);
}
