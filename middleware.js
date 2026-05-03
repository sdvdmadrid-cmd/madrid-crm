import { NextResponse } from "next/server";
import { verifyEdgeSessionToken } from "./src/lib/auth-edge";

const LEGAL_COOKIE_NAME = "cf_legal";

// ── Distributed Rate Limiter (Edge Runtime, Upstash Redis HTTP) ──────────────
// Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// are configured. Falls back to in-memory (single-instance only).
//
// To enable: signup at https://upstash.com, create a Redis DB, copy the
// REST URL and TOKEN into your environment variables.
// ─────────────────────────────────────────────────────────────────────────────

const RL_WINDOW_MS  = 60_000; // 1 minute sliding window
const RL_WRITE_LIMIT = 50;    // POST/PUT/PATCH/DELETE per user per window
const RL_READ_LIMIT  = 300;   // GET per user per window
const RL_STORE = new Map();   // fallback in-memory store

// Paths exempt from rate limiting (webhooks, async jobs)
const RL_EXEMPT_PATHS = [
  "/api/payments/webhooks",
  "/api/email/webhooks",
  "/api/inngest/",
];

function rateLimitKey(userId, pathname) {
  const prefix = pathname.split("/").slice(0, 4).join("/");
  return `rl:${userId}:${prefix}`;
}

function isRateLimitExempt(pathname) {
  return RL_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
}

// Redis HTTP call via Upstash REST API (works in Edge Runtime)
async function redisIncr(key, windowSeconds) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    // INCR key
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!incrRes.ok) return null;
    const { result: count } = await incrRes.json();

    // Set TTL only on first increment (count === 1)
    if (count === 1) {
      await fetch(`${url}/expire/${encodeURIComponent(key)}/${windowSeconds}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    return count;
  } catch {
    return null; // Redis unavailable → fall back to in-memory
  }
}

async function checkRateLimit(key, limit) {
  // Try Redis first (distributed — works across all serverless instances)
  const count = await redisIncr(key, Math.ceil(RL_WINDOW_MS / 1000));
  if (count !== null) return count <= limit;

  // Fallback: in-memory (single instance)
  const now = Date.now();
  const entry = RL_STORE.get(key);
  if (!entry || now - entry.windowStart > RL_WINDOW_MS) {
    RL_STORE.set(key, { count: 1, windowStart: now });
    if (RL_STORE.size > 10000) {
      const cutoff = now - RL_WINDOW_MS;
      for (const [k, v] of RL_STORE) {
        if (v.windowStart < cutoff) RL_STORE.delete(k);
      }
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function rateLimitedResponse() {
  return NextResponse.json(
    { success: false, error: "Too many requests. Please try again in a minute." },
    {
      status: 429,
      headers: {
        "Retry-After": "60",
        "Cache-Control": "private, no-store",
        "X-RateLimit-Limit": "50",
        "X-RateLimit-Window": "60s",
      },
    },
  );
}
// ─────────────────────────────────────────────────────────────────────────────

// Rutas públicas que no requieren autenticación
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-verification",
  "/api/health",
  "/api/payments/webhooks",
  "/api/email/webhooks",
  "/api/email/inbound",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/public",
  "/api/public",
  "/site",
  "/legal",
  "/legal-required",
];

// Paths that are authenticated but bypass the legal acceptance check
const LEGAL_BYPASS_PREFIXES = [
  "/legal",
  "/legal-required",
  "/login",
  "/register",
  "/reset-password",
  "/verify-email",
  "/api/auth",
  "/api/legal",
  "/api/public",
  "/api/health",
  "/api/payments/webhooks",
  "/api/email",
  "/_next",
  "/public",
  "/favicon.ico",
  "/robots.txt",
];

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isLegalBypassPath(pathname) {
  return LEGAL_BYPASS_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(prefix + "/") ||
      pathname.startsWith(prefix + "?"),
  );
}

function legalRequiredApiResponse() {
  return NextResponse.json(
    {
      success: false,
      error: "Legal acceptance required before using the platform.",
      code: "LEGAL_REQUIRED",
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Legal-Required": "true",
      },
    },
  );
}

function parseLegalCookie(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return { tenantId: "", version: "" };

  const separator = raw.indexOf("::");
  if (separator === -1) {
    return { tenantId: "", version: raw };
  }

  return {
    tenantId: raw.slice(0, separator).trim(),
    version: raw.slice(separator + 2).trim(),
  };
}

function unauthenticatedApiResponse() {
  return NextResponse.json(
    { success: false, error: "Unauthenticated" },
    {
      status: 401,
      headers: {
        "Cache-Control":
          "private, no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        Vary: "Cookie, Authorization",
        "X-Auth-Proxy": "enforced",
      },
    },
  );
}

function resolveWebsiteSlugFromHost(request) {
  const hostHeader = String(request.headers.get("host") || "").trim().toLowerCase();
  if (!hostHeader) return "";

  const hostname = hostHeader.split(":")[0];
  if (!hostname.includes(".")) return "";
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return "";

  const configuredDomain = String(process.env.NEXT_PUBLIC_SITE_DOMAIN || "FieldBase.com")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "");

  if (!configuredDomain || !hostname.endsWith(configuredDomain)) return "";

  const suffix = `.${configuredDomain}`;
  if (!hostname.endsWith(suffix)) return "";

  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || ["www", "app", "api"].includes(subdomain)) return "";
  return subdomain;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname === "/website-builder") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/website";
    return NextResponse.redirect(redirectUrl);
  }

  const subdomainSlug = resolveWebsiteSlugFromHost(request);
  if (subdomainSlug && (pathname === "/" || pathname === "")) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/site/${subdomainSlug}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  // Permitir la raíz (landing page pública) y rutas públicas
  if (pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Leer cookie de sesión
  const cookie =
    request.cookies.get("__Host-madrid_session")?.value ||
    request.cookies.get("madrid_session")?.value;
  if (!cookie) {
    if (isApiPath(pathname)) {
      return unauthenticatedApiResponse();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Validar token
  const session = await verifyEdgeSessionToken(cookie);
  if (!session) {
    if (isApiPath(pathname)) {
      return unauthenticatedApiResponse();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Sesión válida, continuar
  // ── Rate limiting (except webhooks) ──
  if (isApiPath(pathname) && !isRateLimitExempt(pathname)) {
    const userId = String(session?.userId || session?.sub || "anon");
    const method = request.method || "GET";
    const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
    const limit = isWrite ? RL_WRITE_LIMIT : RL_READ_LIMIT;
    const key = rateLimitKey(userId, pathname);
    const allowed = await checkRateLimit(key, limit);
    if (!allowed) {
      return rateLimitedResponse();
    }
  }

  // ── Legal acceptance enforcement ──
  if (!isLegalBypassPath(pathname)) {
    const legalCookie = request.cookies.get(LEGAL_COOKIE_NAME)?.value || "";
    const parsed = parseLegalCookie(decodeURIComponent(legalCookie));
    const sessionTenantId = String(
      session?.tenantDbId || session?.tenantId || session?.userId || "",
    ).trim();

    // Backward-safe behavior:
    // - Preferred cookie format: tenantId::version
    // - Legacy cookie format (version only) is temporarily allowed by middleware,
    //   while API routes enforce tenant+version in DB.
    const legalAccepted = Boolean(
      parsed.version &&
        ((parsed.tenantId && parsed.tenantId === sessionTenantId) ||
          (!parsed.tenantId && sessionTenantId)),
    );

    if (!legalAccepted) {
      if (isApiPath(pathname)) {
        return legalRequiredApiResponse();
      }
      const url = request.nextUrl.clone();
      url.pathname = "/legal-required";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|public|api/public).*)"],
};
