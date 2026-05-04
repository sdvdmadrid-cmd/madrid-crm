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

export async function GET() {
  const startedAt = Date.now();
  const secretHealth = getSecretHealth();
  const requiresStrongSecret = process.env.NODE_ENV === "production";
  const authHealthy =
    !requiresStrongSecret || (secretHealth.configured && secretHealth.strong);

  try {
    const dbStatus = await checkSupabase();
    const dbLabel = "supabase";
    const dbHealthy = dbStatus.ok;

    if (!authHealthy || !dbHealthy) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "degraded",
          [dbLabel]: dbHealthy ? "ok" : "error",
          auth: authHealthy ? "ok" : "error",
          responseMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: "ok",
        uptimeSeconds: Math.floor(process.uptime()),
        responseMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        status: "degraded",
        responseMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
