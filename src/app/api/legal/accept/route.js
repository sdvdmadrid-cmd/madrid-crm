import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildLegalCookieValue,
  LEGAL_COOKIE_MAX_AGE,
  LEGAL_COOKIE_NAME,
  getClientIp,
} from "@/lib/legal";
import { getCurrentLegalVersionForTenant } from "@/lib/legal-versions";
import { getAuthenticatedTenantContext } from "@/lib/tenant";
import { enforceSameOriginForMutation } from "@/lib/request-security";

export async function POST(request) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

    const { tenantDbId, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated || !userId) {
      return Response.json(
        { success: false, error: "Unauthenticated" },
        { status: 401 },
      );
    }

    const scopedTenantId = String(tenantDbId || userId || "").trim();
    const current = await getCurrentLegalVersionForTenant({
      tenantId: scopedTenantId,
      userId,
    });

    const body = await request.json().catch(() => ({}));
    const version = String(body.version || current.version_name).trim();

    // Only accept the current tenant legal version
    if (version !== current.version_name) {
      return Response.json(
        {
          success: false,
          error: "Invalid legal version. Please accept the current version.",
        },
        { status: 400 },
      );
    }

    const ip = getClientIp(request);
    const userAgent = (
      request.headers.get("user-agent") || "unknown"
    ).slice(0, 512);
    const now = new Date().toISOString();

    // Insert acceptance record
    const { error: insertError } = await supabaseAdmin
      .from("legal_acceptance")
      .insert({
        user_id: userId,
        tenant_id: scopedTenantId,
        version,
        accepted: true,
        accepted_at: now,
        ip_address: ip,
        user_agent: userAgent,
      });

    if (insertError) {
      console.error("[api/legal/accept] Insert error", insertError);
      return Response.json(
        { success: false, error: "Failed to record acceptance." },
        { status: 500 },
      );
    }

    // Write audit log
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      tenant_id: scopedTenantId,
      action: "accepted_legal",
      metadata: {
        legal_version_id: current.id,
        version,
        ip_address: ip,
        user_agent: userAgent.slice(0, 120),
      },
      created_at: now,
    });

    // Build response and set legal acceptance cookie
    const isProduction = process.env.NODE_ENV === "production";
    const cookiePayload = buildLegalCookieValue(scopedTenantId, version);
    const cookieValue = `${LEGAL_COOKIE_NAME}=${encodeURIComponent(cookiePayload)}; Max-Age=${LEGAL_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Strict${isProduction ? "; Secure" : ""}`;

    return Response.json(
      { success: true, data: { version, acceptedAt: now } },
      { status: 200, headers: { "Set-Cookie": cookieValue } },
    );
  } catch (err) {
    console.error("[api/legal/accept] error", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
