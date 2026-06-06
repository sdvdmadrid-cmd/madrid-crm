/**
 * List pagination params for CRM APIs. Kept separate from tenant-scope so unit
 * tests can import without the server-only boundary.
 */
export const DEFAULT_UNPAGINATED_CAP = 100;

export function getListPaginationParams(searchParams, { maxLimit = 100 } = {}) {
  const envDefault = Number(process.env.CRM_DEFAULT_LIST_LIMIT || 50);
  const hasExplicit =
    searchParams.has("page") || searchParams.has("limit");

  if (!hasExplicit && !(envDefault > 0)) {
    return { paginate: false, page: 1, limit: 0, from: 0, to: 0 };
  }

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(searchParams.get("limit") || envDefault || 50)),
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return { paginate: true, page, limit, from, to };
}

/** Caps unpaginated list queries to reduce full-table scans on large tenants. */
export function applyUnpaginatedSafetyLimit(query, paginate, cap = DEFAULT_UNPAGINATED_CAP) {
  if (!paginate) {
    return query.limit(cap);
  }
  return query;
}
