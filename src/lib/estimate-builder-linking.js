import { normalizeBaseNumber } from "./quote-numbering.js";

/**
 * Public-facing number for an estimate_builder row. Canonical column is
 * `estimate_number`; legacy app code sometimes referenced `quote_number`
 * on this table, but that column was never part of the schema.
 */
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
 * Find an estimate row when linking invoices/quotes by number.
 * Pipeline `estimates` table first; legacy `estimate_builder` rows remain
 * readable for historical invoices only.
 */
export async function findEstimateBuilderForNumber(
  supabase,
  tenantId,
  lookupNumber,
) {
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

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("estimate_builder")
      .select("id, estimate_number, quote_id, client_id")
      .eq("tenant_id", tenantId)
      .eq("estimate_number", candidate)
      .maybeSingle();

    if (!error && data?.id) return { ...data, source: "estimate_builder" };
  }

  const quoteTenantId = String(tenantId);

  for (const candidate of candidates) {
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id")
      .eq("tenant_id", quoteTenantId)
      .eq("quote_number", candidate)
      .maybeSingle();

    if (quoteError || !quote?.id) continue;

    const { data: estimate, error: estimateError } = await supabase
      .from("estimate_builder")
      .select("id, estimate_number, quote_id, client_id")
      .eq("tenant_id", tenantId)
      .eq("quote_id", quote.id)
      .maybeSingle();

    if (!estimateError && estimate?.id) return estimate;
  }

  return null;
}
