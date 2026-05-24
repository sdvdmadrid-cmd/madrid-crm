import { getSessionSecretHealth } from "@/lib/session-secret";

const MIN_SECRET_LENGTH = Number(process.env.SESSION_SECRET_MIN_LENGTH || 32);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

async function checkSupabase() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      reason: "Missing Supabase URL or publishable key",
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      cache: "no-store",
    });

    return {
      ok: response.ok,
      reason: response.ok
        ? "ok"
        : `Supabase health returned ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "Supabase request failed",
    };
  }
}

function getSecretHealth() {
  return getSessionSecretHealth(MIN_SECRET_LENGTH);
}

function healthHeaders(commitSha = "") {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
  const normalized = String(commitSha || "").slice(0, 12);
  if (normalized) {
    headers["X-Fieldbase-Commit"] = normalized;
  }
  return headers;
}

export async function GET() {
  const startedAt = Date.now();
  const secretHealth = getSecretHealth();
  const requiresStrongSecret = process.env.NODE_ENV === "production";
  const authHealthy =
    !requiresStrongSecret || (secretHealth.configured && secretHealth.strong);

  // GitHub Security Preflight: local next start with dummy Supabase URLs.
  if (process.env.SECURITY_PREFLIGHT_CI === "true") {
    const ok = authHealthy;
    const commitSha =
      process.env.NEXT_PUBLIC_BUILD_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      "";
    return new Response(
      JSON.stringify({
        success: ok,
        status: ok ? "ok" : "degraded",
        commitSha: commitSha ? String(commitSha).slice(0, 12) : null,
        mode: "security_preflight_ci",
        responseMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      }),
      {
        status: ok ? 200 : 503,
        headers: healthHeaders(commitSha),
      },
    );
  }

  try {
    const dbStatus = await checkSupabase();
    const dbLabel = "supabase";
    const dbHealthy = dbStatus.ok;

    const commitSha =
      process.env.NEXT_PUBLIC_BUILD_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      "";

    if (!authHealthy || !dbHealthy) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "degraded",
          commitSha: commitSha ? String(commitSha).slice(0, 12) : null,
          [dbLabel]: dbHealthy ? "ok" : "error",
          auth: authHealthy ? "ok" : "error",
          responseMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 503,
          headers: healthHeaders(commitSha),
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: "ok",
        commitSha: commitSha ? String(commitSha).slice(0, 12) : null,
        stripeConnectEnabled:
          String(process.env.STRIPE_CONNECT_ENABLED || "").toLowerCase() ===
          "true",
        uptimeSeconds: Math.floor(process.uptime()),
        responseMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: healthHeaders(commitSha),
      },
    );
  } catch {
    const commitSha =
      process.env.NEXT_PUBLIC_BUILD_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      "";
    return new Response(
      JSON.stringify({
        success: false,
        status: "degraded",
        commitSha: commitSha ? String(commitSha).slice(0, 12) : null,
        responseMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: healthHeaders(commitSha),
      },
    );
  }
}
