import "server-only";

import { timingSafeEqualString } from "@/lib/request-security";

/**
 * Resolves cron secrets from env keys plus optional Vercel CRON_SECRET.
 */
export function resolveCronSecrets(envKeys = []) {
  const keys = Array.isArray(envKeys) ? envKeys : [envKeys];
  const secrets = new Set();

  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) secrets.add(value);
  }

  const vercelCron = String(process.env.CRON_SECRET || "").trim();
  if (vercelCron) secrets.add(vercelCron);

  return [...secrets];
}

/**
 * Validates x-cron-secret or Authorization: Bearer (Vercel Cron).
 */
export function isCronAuthorized(request, envKeys = ["BILL_AUTOPAY_CRON_SECRET"]) {
  const secrets = resolveCronSecrets(envKeys);
  if (!secrets.length) return false;

  const headerSecret = String(request.headers.get("x-cron-secret") || "").trim();
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const candidate = headerSecret || bearer;
  if (!candidate) return false;

  return secrets.some((secret) => timingSafeEqualString(candidate, secret));
}

export function unauthorizedCronResponse() {
  return new Response(
    JSON.stringify({ success: false, error: "Unauthorized" }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}
