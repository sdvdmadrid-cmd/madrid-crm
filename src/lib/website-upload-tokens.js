import "server-only";

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveSessionSecret } from "@/lib/session-secret";

const TOKENS_TABLE = "website_upload_tokens";

// Tokens live for 24 hours by default. That's long enough for a
// contractor to walk to a job site and shoot photos throughout the day,
// short enough that a leaked QR doesn't become a permanent backdoor.
export const WEBSITE_UPLOAD_TOKEN_TTL_SECONDS = 60 * 60 * 24;

// Per-token upload cap so a leaked token can't run wild. Tuned for the
// "shoot a batch of job-site photos" use case.
export const WEBSITE_UPLOAD_TOKEN_DEFAULT_MAX = 30;

function getSigningSecret() {
  const secret = resolveSessionSecret().value;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured");
  }
  return secret;
}

/**
 * Mint a new short-lived upload token and persist its audit row. The
 * persisted row tracks usage (counts, last IP) and lets the contractor
 * revoke a leaked token from the builder UI.
 */
export async function issueWebsiteUploadToken({
  tenantId,
  userId,
  label = "",
  maxUploads = WEBSITE_UPLOAD_TOKEN_DEFAULT_MAX,
  ttlSeconds = WEBSITE_UPLOAD_TOKEN_TTL_SECONDS,
}) {
  const safeTenant = String(tenantId || "").trim();
  if (!safeTenant) {
    throw new Error("tenantId is required to issue an upload token");
  }
  const ttl = Math.max(60, Math.min(60 * 60 * 24 * 7, Number(ttlSeconds) || WEBSITE_UPLOAD_TOKEN_TTL_SECONDS));
  const cap = Math.max(1, Math.min(200, Number(maxUploads) || WEBSITE_UPLOAD_TOKEN_DEFAULT_MAX));
  const jti = crypto.randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  const token = jwt.sign(
    {
      sub: safeTenant,
      jti,
      purpose: "website-upload",
    },
    getSigningSecret(),
    { algorithm: "HS256", expiresIn: ttl },
  );

  // Persist the audit row. If the migration hasn't run yet we still
  // hand the contractor a working JWT — verification falls back to
  // signature-only mode in that case, see verifyWebsiteUploadToken().
  try {
    await supabaseAdmin.from(TOKENS_TABLE).insert({
      tenant_id: safeTenant,
      issued_by_user_id: userId || null,
      jti,
      label: String(label || "").slice(0, 120),
      max_uploads: cap,
      upload_count: 0,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.warn(
      "[website-upload-tokens] failed to persist token row",
      err?.message || String(err),
    );
  }

  return { token, jti, expiresAt, maxUploads: cap };
}

/**
 * Verify a token presented by the public upload endpoint. Checks the
 * JWT signature + expiry + purpose, then loads the audit row to enforce
 * the upload cap and revocation status. Returns `{ ok, tenantId, jti,
 * row, error, status }`.
 */
export async function verifyWebsiteUploadToken(token) {
  const raw = String(token || "").trim();
  if (!raw || raw.length < 32) {
    return { ok: false, error: "Invalid or missing upload token", status: 403 };
  }

  let payload;
  try {
    payload = jwt.verify(raw, getSigningSecret(), { algorithms: ["HS256"] });
  } catch {
    return { ok: false, error: "Invalid or missing upload token", status: 403 };
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    payload.purpose !== "website-upload" ||
    !payload.sub ||
    !payload.jti
  ) {
    return { ok: false, error: "Invalid or missing upload token", status: 403 };
  }

  const tenantId = String(payload.sub);
  const jti = String(payload.jti);

  let row = null;
  try {
    const { data, error } = await supabaseAdmin
      .from(TOKENS_TABLE)
      .select("*")
      .eq("jti", jti)
      .maybeSingle();
    if (error && !/relation .* does not exist/i.test(error.message || "")) {
      console.warn(
        "[website-upload-tokens] failed to load audit row",
        error.message,
      );
    }
    row = data || null;
  } catch (err) {
    console.warn(
      "[website-upload-tokens] audit row lookup threw",
      err?.message || String(err),
    );
  }

  // If the table doesn't exist yet (pre-migration deploy), fall back to
  // signature/expiry-only verification so contractors aren't locked out.
  if (!row) {
    return { ok: true, tenantId, jti, row: null };
  }

  if (row.revoked_at) {
    return { ok: false, error: "This upload link was revoked.", status: 403 };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "This upload link expired.", status: 403 };
  }
  if (Number(row.upload_count || 0) >= Number(row.max_uploads || WEBSITE_UPLOAD_TOKEN_DEFAULT_MAX)) {
    return { ok: false, error: "This upload link reached its photo limit.", status: 429 };
  }

  return { ok: true, tenantId, jti, row };
}

/**
 * Bump the usage counter for a token. Fail-soft: a stat update failure
 * never blocks the upload itself.
 */
export async function recordWebsiteUploadTokenUse({
  jti,
  incrementBy = 1,
  ip = "",
}) {
  if (!jti) return;
  try {
    const { data } = await supabaseAdmin
      .from(TOKENS_TABLE)
      .select("upload_count")
      .eq("jti", jti)
      .maybeSingle();
    const next = Number(data?.upload_count || 0) + Math.max(1, Number(incrementBy) || 1);
    await supabaseAdmin
      .from(TOKENS_TABLE)
      .update({
        upload_count: next,
        last_used_at: new Date().toISOString(),
        last_used_ip: String(ip || "").slice(0, 60),
      })
      .eq("jti", jti);
  } catch (err) {
    console.warn(
      "[website-upload-tokens] failed to record use",
      err?.message || String(err),
    );
  }
}

/**
 * Mark a token as revoked. Idempotent.
 */
export async function revokeWebsiteUploadToken({ tenantId, jti }) {
  if (!tenantId || !jti) return false;
  try {
    const { error } = await supabaseAdmin
      .from(TOKENS_TABLE)
      .update({ revoked_at: new Date().toISOString() })
      .eq("tenant_id", String(tenantId))
      .eq("jti", String(jti));
    return !error;
  } catch (err) {
    console.warn(
      "[website-upload-tokens] failed to revoke",
      err?.message || String(err),
    );
    return false;
  }
}
