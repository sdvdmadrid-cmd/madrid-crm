/** UI page size for /clients list fetches (server max 100 per tenant-scope). */
export const CLIENTS_UI_PAGE_SIZE = 100;

/**
 * Normalize GET /api/clients payloads to a client array.
 * Supports raw arrays and paginated `{ data: [...] }` shapes.
 */
export function normalizeClientsListPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.data)) {
    return payload.data;
  }
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    console.warn(
      "[clients] Expected list array or { data: [] }, received:",
      typeof payload,
      payload,
    );
  }
  return [];
}

export function getClientsListMeta(payload, listLength = 0) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const total = Number(payload.total);
    const page = Number(payload.page) || 1;
    const limit = Number(payload.limit) || listLength;
    const pages = Number(payload.pages) || 1;
    return {
      total: Number.isFinite(total) ? total : listLength,
      page,
      limit,
      pages: Number.isFinite(pages) ? pages : 1,
    };
  }
  return { total: listLength, page: 1, limit: listLength, pages: 1 };
}
