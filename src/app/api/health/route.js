const SESSION_SECRET = String(process.env.SESSION_SECRET || "").trim();
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
  const isConfigured = SESSION_SECRET.length > 0;
  const isStrong = SESSION_SECRET.length >= MIN_SECRET_LENGTH;
  return {
    configured: isConfigured,
    strong: isStrong,
    minLength: MIN_SECRET_LENGTH,
  };
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
          provider: "supabase",
          [dbLabel]: dbHealthy ? "ok" : "error",
          auth: authHealthy ? "ok" : "error",
          error: dbHealthy ? null : dbStatus.reason,
          checks: {
            sessionSecret: secretHealth,
          },
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
        provider: "supabase",
        [dbLabel]: "ok",
        auth: "ok",
        checks: {
          sessionSecret: secretHealth,
        },
        uptimeSeconds: Math.floor(process.uptime()),
        responseMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        status: "degraded",
        provider: "supabase",
        auth: authHealthy ? "ok" : "error",
        checks: {
          sessionSecret: secretHealth,
        },
        error: error.message,
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
