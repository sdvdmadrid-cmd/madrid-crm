const SESSION_SECRET = String(process.env.SESSION_SECRET || "").trim();
const MIN_SECRET_LENGTH = Number(process.env.SESSION_SECRET_MIN_LENGTH || 32);
const JWT_ISSUER = process.env.SESSION_JWT_ISSUER || "madrid-app";
const JWT_AUDIENCE = process.env.SESSION_JWT_AUDIENCE || "madrid-app-users";

const encoder = new TextEncoder();

function decodeBase64Url(input) {
  const normalized = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeBase64UrlJson(input) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(input)));
  } catch {
    return null;
  }
}

export async function verifyEdgeSessionToken(token) {
  if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be configured");
  }

  if (
    process.env.NODE_ENV === "production" &&
    SESSION_SECRET.length < MIN_SECRET_LENGTH
  ) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production`,
    );
  }

  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeBase64UrlJson(encodedHeader);
  const payload = decodeBase64UrlJson(encodedPayload);

  if (!header || !payload || header.alg !== "HS256") {
    return null;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      encoder.encode(`${encodedHeader}.${encodedPayload}`),
    );

    if (!validSignature) {
      return null;
    }
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp === "number" && payload.exp <= now) {
    return null;
  }

  if (typeof payload.nbf === "number" && payload.nbf > now) {
    return null;
  }

  if (payload.iss !== JWT_ISSUER) {
    return null;
  }

  const audience = payload.aud;
  const hasAudience = Array.isArray(audience)
    ? audience.includes(JWT_AUDIENCE)
    : audience === JWT_AUDIENCE;

  if (!hasAudience) {
    return null;
  }

  return payload && typeof payload === "object" ? payload : null;
}