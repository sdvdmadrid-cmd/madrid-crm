import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Look up the contractor's signature threshold from company_profiles.
 *
 * Returns:
 *   { threshold: number | null }
 *
 * A null threshold means "no signature required". A positive threshold
 * means the customer must type a signature before approving any estimate
 * with total > threshold. Failures (missing row, missing column, RLS)
 * resolve to null so the existing approval flow is never blocked.
 */
export async function getSignaturePolicyForTenant(tenantId) {
  const id = String(tenantId || "").trim();
  if (!id) return { threshold: null };

  try {
    const { data, error } = await supabaseAdmin
      .from("company_profiles")
      .select("signature_required_above_amount")
      .eq("tenant_id", id)
      .maybeSingle();

    if (error || !data) return { threshold: null };

    const raw = data.signature_required_above_amount;
    if (raw === null || raw === undefined || raw === "") return { threshold: null };

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return { threshold: null };

    return { threshold: parsed };
  } catch (err) {
    // Includes "column does not exist" before the migration has been
    // applied — treat as no policy configured so existing tenants behave
    // exactly like before.
    console.warn("[estimate-signature-policy] lookup failed", {
      tenantId: id,
      error: err?.message || String(err),
    });
    return { threshold: null };
  }
}

/**
 * Convenience helper: returns true when an estimate of a given total
 * requires a signature for the given tenant. Useful in API gates.
 */
export async function isSignatureRequiredForEstimate({ tenantId, total }) {
  const { threshold } = await getSignaturePolicyForTenant(tenantId);
  if (threshold === null) return { required: false, threshold: null };
  const numericTotal = Number(total) || 0;
  return { required: numericTotal > threshold, threshold };
}

/**
 * Lightweight sanitizer for the typed signature name. Limits length,
 * trims, and strips invisible whitespace so we don't accidentally store
 * a 5 MB blob. Returns "" when the input is unusable.
 */
export function sanitizeSignatureName(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .slice(0, 120);
  if (raw.length < 2) return "";
  return raw;
}
