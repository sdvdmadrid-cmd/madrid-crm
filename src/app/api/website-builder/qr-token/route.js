import QRCode from "qrcode";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  WEBSITE_UPLOAD_TOKEN_TTL_SECONDS,
  WEBSITE_UPLOAD_TOKEN_DEFAULT_MAX,
  issueWebsiteUploadToken,
  revokeWebsiteUploadToken,
} from "@/lib/website-upload-tokens";

const TOKENS_TABLE = "website_upload_tokens";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolveAppOrigin(request) {
  const fromEnv = (process.env.APP_URL || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  try {
    const { origin } = new URL(request.url);
    return origin;
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * GET /api/website-builder/qr-token
 * Lists the contractor's active (non-revoked, non-expired) upload tokens.
 */
export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { data, error } = await supabaseAdmin
      .from(TOKENS_TABLE)
      .select("id, jti, label, max_uploads, upload_count, expires_at, revoked_at, last_used_at, created_at")
      .eq("tenant_id", tenantDbId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error && /relation .* does not exist/i.test(error.message || "")) {
      return jsonResponse({ success: true, data: [] });
    }
    if (error) {
      console.error("[api/website-builder/qr-token][GET] error", error.message);
      return jsonResponse({ success: false, error: "Unable to load tokens" }, 500);
    }

    return jsonResponse({ success: true, data: data || [] });
  } catch (error) {
    console.error("[api/website-builder/qr-token][GET] error", error);
    return jsonResponse({ success: false, error: "Unable to load tokens" }, 500);
  }
}

/**
 * POST /api/website-builder/qr-token
 * Issues a new short-lived upload token + a QR code (PNG data URL) that
 * encodes the public mobile-upload URL `${origin}/u/${token}`.
 *
 * Body (all optional):
 *   - label: string (free-form, shown in the builder's token list)
 *   - maxUploads: number (1..200, default 30)
 *   - ttlSeconds: number (60..7 days, default 24h)
 */
export async function POST(request) {
  try {
    const sameOriginBlock = enforceSameOriginForMutation(request);
    if (sameOriginBlock) return sameOriginBlock;
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, userId, role, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const label = String(body.label || "").slice(0, 120);
    const maxUploads = Math.max(1, Math.min(200, Number(body.maxUploads) || WEBSITE_UPLOAD_TOKEN_DEFAULT_MAX));
    const ttlSeconds = Math.max(60, Math.min(60 * 60 * 24 * 7, Number(body.ttlSeconds) || WEBSITE_UPLOAD_TOKEN_TTL_SECONDS));

    const { token, jti, expiresAt } = await issueWebsiteUploadToken({
      tenantId: tenantDbId,
      userId,
      label,
      maxUploads,
      ttlSeconds,
    });

    const origin = resolveAppOrigin(request);
    const uploadUrl = `${origin}/u/${encodeURIComponent(token)}`;
    const qrDataUrl = await QRCode.toDataURL(uploadUrl, {
      errorCorrectionLevel: "M",
      width: 320,
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });

    return jsonResponse({
      success: true,
      data: {
        token,
        jti,
        uploadUrl,
        qrDataUrl,
        expiresAt,
        maxUploads,
        label,
      },
    });
  } catch (error) {
    console.error("[api/website-builder/qr-token][POST] error", error);
    return jsonResponse(
      { success: false, error: error?.message || "Unable to issue upload token" },
      500,
    );
  }
}

/**
 * DELETE /api/website-builder/qr-token?jti=...
 * Revokes a previously-issued upload token.
 */
export async function DELETE(request) {
  try {
    const sameOriginBlock = enforceSameOriginForMutation(request);
    if (sameOriginBlock) return sameOriginBlock;
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const url = new URL(request.url);
    const jti = String(url.searchParams.get("jti") || "").trim();
    if (!jti) {
      return jsonResponse({ success: false, error: "jti is required" }, 400);
    }

    const revoked = await revokeWebsiteUploadToken({ tenantId: tenantDbId, jti });
    return jsonResponse({ success: revoked });
  } catch (error) {
    console.error("[api/website-builder/qr-token][DELETE] error", error);
    return jsonResponse(
      { success: false, error: error?.message || "Unable to revoke token" },
      500,
    );
  }
}
