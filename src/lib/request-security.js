import "server-only";
import crypto from "node:crypto";

function toBuffer(value) {
  return Buffer.from(String(value || ""));
}

export function timingSafeEqualString(left, right) {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hasSessionCookie(request) {
  const cookieHeader = String(request.headers.get("cookie") || "");
  return (
    cookieHeader.includes("__Host-madrid_session=") ||
    cookieHeader.includes("madrid_session=")
  );
}

function hasBearerToken(request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  return authHeader.toLowerCase().startsWith("bearer ");
}

function readOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function resolveTrustedOrigin(request) {
  try {
    const requestUrl = new URL(request.url);
    // In local development (localhost / 127.0.0.1) always trust the request's
    // own origin so the browser's Origin header matches without requiring
    // APP_BASE_URL to be overridden to a localhost value.
    if (
      requestUrl.hostname === "localhost" ||
      requestUrl.hostname === "127.0.0.1"
    ) {
      return requestUrl.origin;
    }
  } catch {
    // fall through to configured origin
  }

  const configured = String(process.env.APP_BASE_URL || "").trim();
  const configuredOrigin = readOrigin(configured);
  if (configuredOrigin) return configuredOrigin;

  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

export function enforceSameOriginForMutation(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  // API clients using bearer tokens are not browser-cookie CSRF targets.
  if (hasBearerToken(request)) {
    return null;
  }

  // Only enforce strict same-origin checks for cookie-authenticated mutations.
  if (!hasSessionCookie(request)) {
    return null;
  }

  const trustedOrigin = resolveTrustedOrigin(request);
  if (!trustedOrigin) {
    return new Response(
      JSON.stringify({ success: false, error: "Security origin is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const origin = readOrigin(request.headers.get("origin"));
  const referer = readOrigin(request.headers.get("referer"));

  if (origin) {
    if (origin !== trustedOrigin) {
      return new Response(
        JSON.stringify({ success: false, error: "CSRF validation failed" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
    return null;
  }

  if (referer) {
    if (referer !== trustedOrigin) {
      return new Response(
        JSON.stringify({ success: false, error: "CSRF validation failed" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
    return null;
  }

  return new Response(
    JSON.stringify({ success: false, error: "Missing origin headers" }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}
