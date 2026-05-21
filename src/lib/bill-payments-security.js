import "server-only";

/** Max bills in one pay request */
export const BILL_PAY_MAX_BULK_COUNT = 25;

/** Max total charge per bulk pay (USD) */
export const BILL_PAY_MAX_BULK_TOTAL_USD = 50_000;

/** Max single bill amount (USD) */
export const BILL_PAY_MAX_SINGLE_AMOUNT_USD = 25_000;

/**
 * Sanitize provider search — blocks PostgREST filter injection.
 */
export function sanitizeProviderSearchQuery(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s&.'-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 48);
}

export function sanitizeProviderCategory(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return value.slice(0, 40);
}

/**
 * Prefer platform-trusted client IP for ACH mandates (set TRUST_PROXY_HEADERS=true on Vercel).
 */
export function getTrustedClientIp(request) {
  const trustProxy =
    process.env.TRUST_PROXY_HEADERS === "true" ||
    process.env.NODE_ENV === "production";

  if (trustProxy) {
    const forwarded = String(request.headers.get("x-forwarded-for") || "")
      .split(",")
      .map((v) => v.trim())
      .find(Boolean);
    if (forwarded) return forwarded.slice(0, 120);
    const realIp = String(request.headers.get("x-real-ip") || "").trim();
    if (realIp) return realIp.slice(0, 120);
  }

  return "127.0.0.1";
}

export function shouldPersistPlaidAccessToken() {
  return (
    String(process.env.BILL_PAYMENTS_STORE_PLAID_ACCESS_TOKEN || "")
      .trim()
      .toLowerCase() === "true"
  );
}

export function validateBulkPayAmounts(bills) {
  let total = 0;
  for (const bill of bills || []) {
    const amount = Number(bill.amount_due || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "Each bill must have a positive amount due" };
    }
    if (amount > BILL_PAY_MAX_SINGLE_AMOUNT_USD) {
      return {
        ok: false,
        error: `Single bill amount cannot exceed $${BILL_PAY_MAX_SINGLE_AMOUNT_USD.toLocaleString()}`,
      };
    }
    total += amount;
  }
  if (total > BILL_PAY_MAX_BULK_TOTAL_USD) {
    return {
      ok: false,
      error: `Total payment cannot exceed $${BILL_PAY_MAX_BULK_TOTAL_USD.toLocaleString()} per batch`,
    };
  }
  return { ok: true, total };
}
