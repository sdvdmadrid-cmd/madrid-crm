import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Resolve a quotes row linked to a pipeline estimate via shared number.
 */
export async function findQuoteLinkedToEstimateNumber({
  tenantDbId,
  role,
  estimateNumber,
}) {
  const raw = String(estimateNumber || "").trim();
  if (!raw) return null;

  let quoteQuery = supabaseAdmin
    .from("quotes")
    .select("id, status, quote_number")
    .eq("quote_number", raw)
    .order("created_at", { ascending: false })
    .limit(1);

  if ((role || "").toLowerCase() !== "super_admin") {
    quoteQuery = quoteQuery.eq("tenant_id", String(tenantDbId));
  }

  const { data: rows, error } = await quoteQuery;
  if (error) throw new Error(error.message);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Block estimate edits while a linked quote is signed unless explicitly unlocked.
 * Returns a Response to return early, or null to continue.
 */
export async function enforceSignedQuoteLockForEstimatePatch({
  tenantDbId,
  role,
  estimateNumber,
  removeQuoteSignature,
}) {
  const linkedQuote = await findQuoteLinkedToEstimateNumber({
    tenantDbId,
    role,
    estimateNumber,
  });
  if (!linkedQuote) return null;

  const linkedQuoteStatus = String(linkedQuote.status || "").toLowerCase();
  if (linkedQuoteStatus === "signed" && !removeQuoteSignature) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Quote is signed and locked. Remove signature before editing this estimate.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  if (linkedQuoteStatus === "signed" && removeQuoteSignature) {
    let unlockQuery = supabaseAdmin
      .from("quotes")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", linkedQuote.id);

    if ((role || "").toLowerCase() !== "super_admin") {
      unlockQuery = unlockQuery.eq("tenant_id", String(tenantDbId));
    }

    const { error: unlockError } = await unlockQuery;
    if (unlockError) throw new Error(unlockError.message);
  }

  return null;
}
