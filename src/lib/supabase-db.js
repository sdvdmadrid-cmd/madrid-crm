const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeUuid(value) {
  const normalized = String(value || "").trim();
  return UUID_RE.test(normalized) ? normalized : null;
}

export function normalizeDateOnly(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function normalizeTimestamp(value) {
  const dateOnly = normalizeDateOnly(value);
  return dateOnly ? `${dateOnly}T00:00:00.000Z` : null;
}

export function logSupabaseError(context, error, meta = undefined) {
  console.error(context, {
    message: error?.message || String(error || "Unknown Supabase error"),
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
    meta: meta || null,
  });
}