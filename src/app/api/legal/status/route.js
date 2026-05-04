import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildLegalCookieValue,
  LEGAL_COOKIE_MAX_AGE,
  LEGAL_COOKIE_NAME,
} from "@/lib/legal";
import { getCurrentLegalVersionForTenant } from "@/lib/legal-versions";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

export async function GET(request) {
  try {
    const { userId, tenantDbId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated || !userId) {
      return Response.json(
        { success: false, error: "Unauthenticated" },
        { status: 401 },
      );
    }

    const current = await getCurrentLegalVersionForTenant({
      tenantId: tenantDbId,
      userId,
    });
    const scopedTenantId = String(tenantDbId || userId || "").trim();

    const { data: acceptance, error } = await supabaseAdmin
      .from("legal_acceptance")
      .select("id, version, accepted_at")
      .eq("user_id", userId)
      .eq("tenant_id", scopedTenantId)
      .eq("version", current.version_name)
      .eq("accepted", true)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[api/legal/status] Query error", error);
      return Response.json(
        { success: false, error: "Failed to check acceptance." },
        { status: 500 },
      );
    }

    const accepted = !!acceptance;

    // If accepted via DB but cookie is missing, repair it now so middleware
    // stops redirecting the user back to /legal-required on every request.
    const responseHeaders = {};
    if (accepted) {
      const isProduction = process.env.NODE_ENV === "production";
      const cookiePayload = buildLegalCookieValue(scopedTenantId, current.version_name);
      responseHeaders["Set-Cookie"] = `${LEGAL_COOKIE_NAME}=${encodeURIComponent(cookiePayload)}; Max-Age=${LEGAL_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Strict${isProduction ? "; Secure" : ""}`;
    }

    return Response.json(
      {
        success: true,
        data: {
          accepted,
          version: current.version_name,
          acceptedAt: acceptance?.accepted_at || null,
        },
      },
      { status: 200, headers: responseHeaders },
    );
  } catch (err) {
    console.error("[api/legal/status] error", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
