import { supabaseAdmin } from "@/lib/supabase-admin";
import { LEGAL_COOKIE_NAME, parseLegalCookieValue } from "@/lib/legal";
import { getCurrentLegalVersionForTenant } from "@/lib/legal-versions";

/**
 * Check if the authenticated user has accepted the current legal version.
 * Returns { accepted: boolean, userId: string|null }.
 *
 * Checks the request cookie first (fast path), then falls back to DB
 * lookup for cases where the cookie was cleared or is absent.
 */
export async function checkLegalAcceptance(request, userId, tenantId) {
  const scopedTenantId = String(tenantId || userId || "").trim();
  if (!userId || !scopedTenantId) return { accepted: false, userId: null };

  const current = await getCurrentLegalVersionForTenant({
    tenantId: scopedTenantId,
    userId,
  });

  // Fast path: check cookie
  const legalCookie =
    request.cookies?.get?.(LEGAL_COOKIE_NAME)?.value ||
    request.headers?.get?.("cookie")
      ?.split(";")
      ?.find((c) => c.trim().startsWith(`${LEGAL_COOKIE_NAME}=`))
      ?.split("=")?.[1];

  const parsedCookie = parseLegalCookieValue(
    legalCookie ? decodeURIComponent(legalCookie) : "",
  );

  if (
    parsedCookie.version === current.version_name &&
    parsedCookie.tenantId === scopedTenantId
  ) {
    return { accepted: true, userId };
  }

  // DB fallback
  try {
    const { data, error } = await supabaseAdmin
      .from("legal_acceptance")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", scopedTenantId)
      .eq("version", current.version_name)
      .eq("accepted", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[legal-enforcement] DB check error", error);
      // Fail open to avoid blocking users due to DB errors
      return { accepted: true, userId };
    }

    return { accepted: !!data, userId };
  } catch (err) {
    console.error("[legal-enforcement] Unexpected error", err);
    return { accepted: true, userId }; // Fail open
  }
}

/**
 * Returns a 403 Response if the user hasn't accepted legal terms.
 * Returns null if accepted (no action needed).
 *
 * Usage:
 *   const legal = await enforceLegalAcceptance(request, userId);
 *   if (legal) return legal;
 */
export async function enforceLegalAcceptance(request, userId, tenantId) {
  const { accepted } = await checkLegalAcceptance(request, userId, tenantId);
  if (!accepted) {
    return Response.json(
      {
        success: false,
        error: "Legal acceptance required before using this feature.",
        code: "LEGAL_REQUIRED",
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Write an audit log entry.
 * Non-throwing — errors are logged but don't fail the caller.
 */
export async function writeAuditLog({
  userId,
  tenantId,
  action,
  metadata = {},
}) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId || "system",
      tenant_id: tenantId || userId || "unknown",
      action: String(action || "unknown"),
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[legal-enforcement] writeAuditLog error", err);
  }
}
