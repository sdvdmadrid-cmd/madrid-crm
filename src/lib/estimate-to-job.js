import { deriveServiceTitleFromScope } from "./estimate-pdf-content.js";
import { parseEstimateNotes } from "./estimate-notes.js";
import { normalizeUuid } from "./supabase-db.js";

/**
 * Map an approved estimate row into a jobs insert payload.
 * Pure helper — safe to unit test without Supabase.
 */
export function buildJobInsertFromEstimate(estimate, { tenantId, userId, nowIso }) {
  const parsed = parseEstimateNotes(estimate?.notes);
  const lineItems = Array.isArray(estimate?.items) ? estimate.items : [];
  const firstNamedLine = lineItems.find((line) => String(line?.name || "").trim());
  const serviceTitle =
    parsed.serviceTitle ||
    deriveServiceTitleFromScope(parsed.noteText, "") ||
    String(firstNamedLine?.name || "").trim() ||
    "Service";
  const estimateNumber = String(estimate?.estimate_number || "").trim();
  const clientName = String(estimate?.client_name || "").trim() || "Client";
  const title = estimateNumber
    ? `${estimateNumber} — ${clientName}`
    : `${clientName} — ${serviceTitle}`;

  const clientId =
    normalizeUuid(estimate?.client_id) || normalizeUuid(parsed.clientUuid);

  return {
    tenant_id: tenantId,
    user_id: userId || null,
    created_by: userId || null,
    title,
    description: parsed.noteText || "",
    client_id: clientId,
    client_name: clientName,
    service: serviceTitle,
    status: "Pending",
    price: String(estimate?.total ?? "").trim(),
    due_date: "",
    tax_state: "",
    down_payment_percent: "50",
    scope_details: parsed.noteText || "",
    square_meters: "",
    complexity: "standard",
    materials_included: true,
    travel_minutes: "",
    urgency: "flexible",
    estimate_snapshot: {
      source: "approved_estimate",
      estimateId: estimate?.id ?? null,
      estimateNumber,
      clientName,
      items: lineItems,
      subtotal: Number(estimate?.subtotal) || 0,
      tax: Number(estimate?.tax) || 0,
      total: Number(estimate?.total) || 0,
      convertedAt: nowIso,
    },
    invoiced: false,
    created_at: nowIso,
    updated_at: nowIso,
  };
}
