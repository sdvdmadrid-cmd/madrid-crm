import jwt from "jsonwebtoken";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SECRET = env.SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_VERSION = env.SESSION_VERSION || "2026-05-05-global-logout-1";
const JWT_ISSUER = env.SESSION_JWT_ISSUER || "madrid-app";
const JWT_AUDIENCE = env.SESSION_JWT_AUDIENCE || "madrid-app-users";

console.log("SECRET hint:", SECRET ? SECRET.slice(0, 8) + "..." : "(missing)");
console.log("SESSION_VERSION:", SESSION_VERSION);
console.log("JWT_ISSUER:", JWT_ISSUER);
console.log("JWT_AUDIENCE:", JWT_AUDIENCE);
console.log("---");

// 1. Create token with jsonwebtoken (same as createSessionToken)
const token = jwt.sign(
  { userId: "test-123", sv: SESSION_VERSION },
  SECRET,
  { algorithm: "HS256", expiresIn: 3600, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
);
console.log("token created:", token.slice(0, 30) + "...");

// 2. Decode parts
const parts = token.split(".");
const [encodedHeader, encodedPayload, encodedSignature] = parts;
const header = JSON.parse(
  Buffer.from(encodedHeader.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
);
const payload = JSON.parse(
  Buffer.from(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
);

console.log("header:", JSON.stringify(header));
console.log("payload:", JSON.stringify(payload));

// 3. Verify with Web Crypto (same logic as verifyEdgeSessionToken)
const encoder = new TextEncoder();

function decodeBase64Url(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const buf = Buffer.from(padded, "base64");
  return new Uint8Array(buf);
}

const key = await crypto.subtle.importKey(
  "raw",
  encoder.encode(SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["verify"],
);

const valid = await crypto.subtle.verify(
  "HMAC",
  key,
  decodeBase64Url(encodedSignature),
  encoder.encode(`${encodedHeader}.${encodedPayload}`),
);

console.log("---");
console.log("Web Crypto signature valid:", valid);
console.log(
  "iss match:",
  payload.iss === JWT_ISSUER,
  `(${JSON.stringify(payload.iss)} === ${JSON.stringify(JWT_ISSUER)})`,
);
console.log(
  "aud match:",
  Array.isArray(payload.aud)
    ? payload.aud.includes(JWT_AUDIENCE)
    : payload.aud === JWT_AUDIENCE,
  `(${JSON.stringify(payload.aud)} === ${JSON.stringify(JWT_AUDIENCE)})`,
);
console.log(
  "sv match:",
  payload.sv === SESSION_VERSION,
  `(${JSON.stringify(payload.sv)} === ${JSON.stringify(SESSION_VERSION)})`,
);

const now = Math.floor(Date.now() / 1000);
console.log("expired:", payload.exp <= now, `(exp=${payload.exp}, now=${now})`);

const allGood = valid && payload.iss === JWT_ISSUER && payload.sv === SESSION_VERSION;
console.log("---");
console.log(allGood ? "✅ COMPATIBLE: edge verifier will accept these tokens" : "❌ INCOMPATIBLE: edge verifier will REJECT these tokens");
