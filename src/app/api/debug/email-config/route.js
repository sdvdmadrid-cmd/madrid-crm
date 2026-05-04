// TEMPORARY DEBUG ENDPOINT — remove after diagnosing email issue
// Access: GET /api/debug/email-config
// Protected: only accessible when DEBUG_SECRET header matches env var

export async function GET(request) {
  const secret = request.headers.get("x-debug-secret") || "";
  const expected = process.env.DEBUG_SECRET || "";

  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const emailProvider = process.env.EMAIL_PROVIDER || "(not set)";
  const emailFrom = process.env.EMAIL_FROM || "(not set)";
  const resendKey = process.env.RESEND_API_KEY || "";
  const appUrl = process.env.APP_URL || "(not set)";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "(not set)";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const nodeEnv = process.env.NODE_ENV || "(not set)";

  return new Response(
    JSON.stringify({
      nodeEnv,
      emailProvider,
      emailFrom,
      resendKeySet: resendKey.length > 0,
      resendKeyPrefix: resendKey ? resendKey.slice(0, 8) + "..." : "(not set)",
      appUrl,
      supabaseUrlSet: supabaseUrl !== "(not set)",
      supabaseServiceKeySet: supabaseServiceKey.length > 0,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
