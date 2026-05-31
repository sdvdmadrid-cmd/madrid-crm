import { normalizeBaseNumber } from "./quote-numbering.js";

export function resolveEstimateLinkedNumber(estimate = {}) {
  const estimateNumber = String(
    estimate.estimate_number || estimate.estimateNumber || "",
  ).trim();
  if (estimateNumber) {
    return normalizeBaseNumber(estimateNumber) || estimateNumber;
  }

  return normalizeBaseNumber(
    estimate.quote_number || estimate.quoteNumber || "",
  );
}

/**
 * Resolve a pipeline estimate by public number (invoices, lookups).
 * Reads `estimates` only — legacy `estimate_builder` is archived, not live workflow.
 */
export async function findEstimateForNumber(supabase, tenantId, lookupNumber) {
  const raw = String(lookupNumber || "").trim();
  if (!raw) return null;

  const normalized = normalizeBaseNumber(raw);
  const candidates = [...new Set([raw, normalized].filter(Boolean))];

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("estimates")
      .select("id, estimate_number, client_id")
      .eq("tenant_id", tenantId)
      .eq("estimate_number", candidate)
      .maybeSingle();

    if (!error && data?.id) {
      return { ...data, quote_id: null, source: "estimates" };
    }
  }

  return null;
}

/** @deprecated Use findEstimateForNumber */
export const findEstimateBuilderForNumber = findEstimateForNumber;
