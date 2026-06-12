// Relative import (not the @/lib alias) so the unit tests in
// tests/unit/estimate-serializer.test.mjs can import this module
// directly under node:test, which doesn't resolve the Next.js
// path alias. The runtime resolves both the same way.
import { parseEstimateNotes } from "./estimate-notes.js";

/**
 * Shared estimate row -> API payload serializer.
 *
 * Three contractor-facing surfaces and two PDF/public surfaces all
 * map an `estimates` row into a camelCase API payload with very
 * similar shapes:
 *
 *   /api/estimates              (list + create)
 *   /api/estimates/[id]         (read + update)
 *   /api/estimates/[id]/pdf      (auth PDF)
 *   /api/estimates/[id]/public/pdf (public PDF)
 *   /api/estimates/[id]/public   (public JSON view)
 *
 * Before this module existed, each was an independent ~30-line
 * function with subtle drift:
 *   - some used `Number(x || 0)` (NaN-prone); others a proper
 *     `toNumber()` (NaN-guarded). The PDF routes were the prone
 *     ones — fixed in F25.
 *   - some surfaced `audit`; some didn't.
 *   - some normalized `status` through the ALLOWED_STATUSES set;
 *     others lowercased raw.
 *
 * The base helper here returns the canonical shape; the contractor-
 * facing routes layer on `publicLink` + role-specific fields, the
 * public/PDF routes consume just the base.
 *
 * This module is pure (no server-only, no supabase) so unit tests
 * can import the real helper directly.
 */

const ALLOWED_STATUSES = new Set([
  "draft",
  "sent",
  "approved",
  "declined",
  "changes_requested",
]);

/**
 * Safe Number coercion. Replaces the unsafe `Number(x || 0)` pattern
 * that silently produces NaN for non-numeric inputs (e.g. when the
 * underlying column is the string "abc" from a manual edit).
 */
export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Normalize a status string to a known token, defaulting to
 * `fallback` for unknown values. Same set the create/PATCH routes
 * already enforce.
 */
export function normalizeEstimateStatusToken(value, fallback = "draft") {
  const normalized = String(value || "").trim().toLowerCase();
  if (ALLOWED_STATUSES.has(normalized)) return normalized;
  return fallback;
}

/**
 * Build the canonical estimate payload shared across contractor and
 * public surfaces. Pure — the caller decides whether to attach
 * `publicLink`, `branding`, signature policy hints, etc.
 */
export function serializeEstimateBase(row) {
  const parsedNotes = parseEstimateNotes(row?.notes);
  return {
    id: row?.id,
    _id: row?.id,
    tenantId: row?.tenant_id || null,
    userId: row?.user_id || null,
    createdBy: row?.created_by || null,
    clientName: row?.client_name || "",
    clientUuid: String(parsedNotes.clientUuid || "").trim(),
    clientEmail: parsedNotes.clientEmail || "",
    clientPhone: parsedNotes.clientPhone || "",
    address: parsedNotes.address,
    status: normalizeEstimateStatusToken(row?.status),
    services: Array.isArray(row?.items) ? row.items : [],
    subtotal: toNumber(row?.subtotal),
    tax: toNumber(row?.tax),
    total: toNumber(row?.total),
    notes: parsedNotes.noteText,
    serviceTitle: parsedNotes.serviceTitle || "",
    audit: parsedNotes.audit,
    estimateNumber: row?.estimate_number || "",
    scheduledVisitDate: row?.scheduled_visit_date
      ? String(row.scheduled_visit_date).slice(0, 10)
      : "",
    jobId: row?.job_id || null,
    clientId: row?.client_id || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}
