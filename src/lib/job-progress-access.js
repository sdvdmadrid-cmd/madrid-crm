import jwt from "jsonwebtoken";
import { resolveSessionSecret } from "./session-secret.js";

const JOB_PROGRESS_TTL_SECONDS = 60 * 60 * 24 * 90;

function getSigningSecret() {
  const secret = resolveSessionSecret().value;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured");
  }
  return secret;
}

export function isValidJobProgressToken(value) {
  const token = String(value || "").trim();
  return token.length >= 32 && /^[A-Za-z0-9._-]+$/.test(token);
}

export function createJobProgressToken(jobId) {
  const id = String(jobId || "").trim();
  if (!id) {
    throw new Error("jobId is required to create a progress token");
  }
  return jwt.sign(
    { sub: id, purpose: "job-progress-public" },
    getSigningSecret(),
    { algorithm: "HS256", expiresIn: JOB_PROGRESS_TTL_SECONDS },
  );
}

export function verifyJobProgressToken(token) {
  const provided = String(token || "").trim();
  if (!isValidJobProgressToken(provided)) {
    return { ok: false, error: "Invalid or missing access token", status: 403 };
  }
  try {
    const payload = jwt.verify(provided, getSigningSecret(), {
      algorithms: ["HS256"],
    });
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.purpose !== "job-progress-public" ||
      !String(payload.sub || "").trim()
    ) {
      return { ok: false, error: "Invalid or missing access token", status: 403 };
    }
    return { ok: true, jobId: String(payload.sub) };
  } catch {
    return { ok: false, error: "Invalid or missing access token", status: 403 };
  }
}

export function buildPublicJobProgressUrl(origin, token) {
  const base = String(origin || "").replace(/\/$/, "");
  const t = encodeURIComponent(String(token || ""));
  if (!base) return `/progress/${t}`;
  return `${base}/progress/${t}`;
}

export function buildPublicJobProgressLink(jobId, origin) {
  const token = createJobProgressToken(jobId);
  const base =
    String(origin || "").replace(/\/$/, "") ||
    String(process.env.APP_URL || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return buildPublicJobProgressUrl(base, token);
}
