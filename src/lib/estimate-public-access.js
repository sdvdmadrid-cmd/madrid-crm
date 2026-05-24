import jwt from "jsonwebtoken";
import { resolveSessionSecret } from "@/lib/session-secret";

/** Statuses that may be viewed via signed public link. */
export const PUBLIC_ESTIMATE_STATUSES = new Set([
  "sent",
  "approved",
  "declined",
  "changes_requested",
]);

/** Statuses where the client may still POST a response. */
export const RESPONDABLE_ESTIMATE_STATUSES = new Set([
  "sent",
  "changes_requested",
]);

const ESTIMATE_PUBLIC_TTL_SECONDS = 60 * 60 * 24 * 90;

function getSigningSecret() {
  const secret = resolveSessionSecret().value;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured");
  }
  return secret;
}

export function normalizeEstimateStatus(value) {
  return String(value || "draft").trim().toLowerCase();
}

export function isPublicEstimateStatus(status) {
  return PUBLIC_ESTIMATE_STATUSES.has(normalizeEstimateStatus(status));
}

export function canRespondToEstimateStatus(status) {
  return RESPONDABLE_ESTIMATE_STATUSES.has(normalizeEstimateStatus(status));
}

export function isValidEstimatePublicToken(value) {
  const token = String(value || "").trim();
  return token.length >= 32 && /^[A-Za-z0-9._-]+$/.test(token);
}

export function createEstimatePublicToken(estimateId) {
  const id = String(estimateId || "").trim();
  if (!id) {
    throw new Error("estimateId is required to create a public access token");
  }

  return jwt.sign(
    { sub: id, purpose: "estimate-public" },
    getSigningSecret(),
    { algorithm: "HS256", expiresIn: ESTIMATE_PUBLIC_TTL_SECONDS },
  );
}

export function verifyEstimatePublicToken(estimateId, token) {
  const id = String(estimateId || "").trim();
  const provided = String(token || "").trim();

  if (!id || !isValidEstimatePublicToken(provided)) {
    return { ok: false, error: "Invalid or missing access token", status: 403 };
  }

  try {
    const payload = jwt.verify(provided, getSigningSecret(), {
      algorithms: ["HS256"],
    });
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.purpose !== "estimate-public" ||
      String(payload.sub || "") !== id
    ) {
      return { ok: false, error: "Invalid or missing access token", status: 403 };
    }
  } catch {
    return { ok: false, error: "Invalid or missing access token", status: 403 };
  }

  return { ok: true };
}

export function verifyEstimatePublicAccess(estimate, token) {
  if (!estimate) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const tokenCheck = verifyEstimatePublicToken(estimate.id, token);
  if (!tokenCheck.ok) {
    return tokenCheck;
  }

  if (!isPublicEstimateStatus(estimate.status)) {
    return { ok: false, error: "Estimate is not available for public access", status: 403 };
  }

  return { ok: true };
}

export function buildPublicEstimateUrl(origin, estimateId, token) {
  const base = String(origin || "").replace(/\/$/, "");
  const id = encodeURIComponent(String(estimateId || ""));
  const t = encodeURIComponent(String(token || ""));
  return `${base}/estimate/${id}?token=${t}`;
}

export function buildPublicEstimateLink(estimateId, origin) {
  const token = createEstimatePublicToken(estimateId);
  const base =
    String(origin || "").replace(/\/$/, "") ||
    String(process.env.APP_URL || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    return `/estimate/${estimateId}?token=${encodeURIComponent(token)}`;
  }
  return buildPublicEstimateUrl(base, estimateId, token);
}
