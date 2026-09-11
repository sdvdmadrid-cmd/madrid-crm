/** Pure text matching helpers (safe for client + unit tests). */

export function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function scoreTextMatch(haystack, needle) {
  const h = normalizeQuery(haystack);
  const n = normalizeQuery(needle);
  if (!h || !n) return 0;
  if (h === n) return 100;
  if (h.includes(n) || n.includes(h)) return 80;
  const parts = n.split(" ").filter((p) => p.length > 2);
  if (!parts.length) return 0;
  const hits = parts.filter((p) => h.includes(p)).length;
  return Math.round((hits / parts.length) * 70);
}
