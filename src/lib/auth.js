import "server-only";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { resolveSessionSecret } from "@/lib/session-secret";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";
const SESSION_TTL_SECONDS = Number(
  process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7,
);
const MIN_SECRET_LENGTH = Number(process.env.SESSION_SECRET_MIN_LENGTH || 32);
const JWT_ISSUER = process.env.SESSION_JWT_ISSUER || "madrid-app";
const JWT_AUDIENCE = process.env.SESSION_JWT_AUDIENCE || "madrid-app-users";
const SESSION_VERSION = process.env.SESSION_VERSION || "2026-05-05-global-logout-1";

function assertSessionSecret() {
  const resolved = resolveSessionSecret();
  const secret = resolved.value;

  if (!secret) {
    throw new Error("SESSION_SECRET must be configured");
  }

  if (process.env.NODE_ENV === "production" && secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production`,
    );
  }

  return secret;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":"))
    return false;
  const [salt, originalHash] = stored.split(":");
  try {
    const computedHash = crypto.scryptSync(password, salt, 64).toString("hex");
    const original = Buffer.from(originalHash, "hex");
    const computed = Buffer.from(computedHash, "hex");
    if (original.length !== computed.length) return false;
    return crypto.timingSafeEqual(original, computed);
  } catch {
    return false;
  }
}

export function createSessionToken(payload) {
  const sessionSecret = assertSessionSecret();
  return jwt.sign({ ...payload, sv: SESSION_VERSION }, sessionSecret, {
    algorithm: "HS256",
    expiresIn: SESSION_TTL_SECONDS,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifySessionToken(token) {
  const sessionSecret = assertSessionSecret();
  if (!token || typeof token !== "string") return null;

  try {
    const payload = jwt.verify(token, sessionSecret, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (!payload || payload.sv !== SESSION_VERSION) {
      return null;
    }
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader) {
  const values = {};
  if (!cookieHeader) return values;

  for (const pair of cookieHeader.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    try {
      values[key] = decodeURIComponent(value);
    } catch {
      values[key] = value;
    }
  }

  return values;
}

export function getSessionFromRequest(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const cookieMap = parseCookieHeader(request.headers.get("cookie") || "");
  const cookieToken = cookieMap[SESSION_COOKIE_NAME] || "";

  const token = bearer || cookieToken;
  return verifySessionToken(token);
}

export function buildSessionCookie(token) {
  const maxAge = SESSION_TTL_SECONDS;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

// ---------------------------------------------------------------------------
// Email confirmation tokens — HMAC-signed JWTs using SESSION_SECRET.
// These are self-contained and do NOT rely on Supabase OTP.
// ---------------------------------------------------------------------------
const EMAIL_CONFIRM_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export function createEmailConfirmToken(userId, email) {
  const secret = assertSessionSecret();
  return jwt.sign(
    { sub: userId, email, purpose: "email-confirm" },
    secret,
    { algorithm: "HS256", expiresIn: EMAIL_CONFIRM_TTL_SECONDS },
  );
}

export function verifyEmailConfirmToken(token) {
  const secret = assertSessionSecret();
  if (!token || typeof token !== "string") return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.purpose !== "email-confirm" ||
      !payload.sub ||
      !payload.email
    ) {
      return null;
    }
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
