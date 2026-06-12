/** @param {string} raw */
export function sanitizeListSearchTerm(raw) {
  const term = String(raw || "").trim();
  if (term.length < 2) return "";
  return term.slice(0, 80).replace(/[%_,]/g, "");
}

/**
 * Apply case-insensitive OR ilike filter across columns (PostgREST).
 * @template T
 * @param {T} query
 * @param {string[]} columns
 * @param {string} term
 */
export function applyListSearchOr(query, columns, term) {
  const safe = sanitizeListSearchTerm(term);
  if (!safe || !columns?.length) return query;
  const pattern = `%${safe}%`;
  const clause = columns.map((col) => `${col}.ilike.${pattern}`).join(",");
  return query.or(clause);
}
