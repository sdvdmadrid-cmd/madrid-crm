import "server-only";

import {
  decodeSupabaseJwtRef,
  getSupabaseProjectRefFromUrl,
  getSupabasePublicKeyEnv,
} from "@/lib/supabase-public-config";

/**
 * Production environment validation
 * Ensures critical configurations are set for safe production deployment
 */

function validateEnvVar(key, description, isRequired = true) {
  const value = process.env[key];

  if (isRequired && !value) {
    const error = `CRITICAL: Missing required environment variable: ${key}\n${description}`;
    console.error(error);
    if (process.env.NODE_ENV === "production") {
      throw new Error(error);
    }
  }

  if (value && typeof value === "string" && value.length < 10) {
    console.warn(
      `WARNING: ${key} appears to be too short. Expected longer value.`
    );
  }

  return !!value;
}

export function validateProductionConfig() {
  const errors = [];
  const warnings = [];

  // === CRITICAL: Security & Authentication ===
  if (!validateEnvVar("SESSION_SECRET", "JWT signing key for sessions", true)) {
    errors.push("SESSION_SECRET not configured");
  }
  if (!validateEnvVar("ENCRYPTION_KEY", "AES-256 key for sensitive data", true)) {
    errors.push("ENCRYPTION_KEY not configured (cannot encrypt Plaid tokens)");
  }

  // === CRITICAL: Supabase runtime identity ===
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serverSupabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const publicKey = getSupabasePublicKeyEnv();

  if (!validateEnvVar("NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL", true)) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL not configured");
  }

  if (!publicKey.key) {
    errors.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not configured (legacy fallback NEXT_PUBLIC_SUPABASE_ANON_KEY also missing)",
    );
  } else if (publicKey.usingLegacyAnonKey) {
    warnings.push(
      "Using legacy NEXT_PUBLIC_SUPABASE_ANON_KEY fallback; set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel production",
    );
  }

  if (serverSupabaseUrl && supabaseUrl && serverSupabaseUrl !== supabaseUrl) {
    errors.push(
      "SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL point to different projects/URLs",
    );
  }

  // === CRITICAL: Third-party Services ===
  if (!validateEnvVar("STRIPE_SECRET_KEY", "Stripe API key", true)) {
    errors.push("STRIPE_SECRET_KEY not configured");
  }
  if (!validateEnvVar("STRIPE_WEBHOOK_SECRET", "Stripe webhook signing key", true)) {
    errors.push("STRIPE_WEBHOOK_SECRET not configured");
  }
  if (!validateEnvVar(
    "SUPABASE_SERVICE_ROLE_KEY",
    "Supabase service role key",
    true
  )) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  const urlProjectRef = getSupabaseProjectRefFromUrl(supabaseUrl || serverSupabaseUrl);
  const serviceRoleRef = decodeSupabaseJwtRef(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const publicJwtRef = decodeSupabaseJwtRef(publicKey.key);
  if (urlProjectRef && serviceRoleRef && urlProjectRef !== serviceRoleRef) {
    errors.push(
      `Supabase project mismatch: URL ref ${urlProjectRef} does not match service role ref ${serviceRoleRef}`,
    );
  }
  if (urlProjectRef && publicJwtRef && urlProjectRef !== publicJwtRef) {
    errors.push(
      `Supabase project mismatch: URL ref ${urlProjectRef} does not match public key ref ${publicJwtRef}`,
    );
  }

  // === HIGH: Email & Notifications ===
  const emailProvider = String(process.env.EMAIL_PROVIDER || "mock")
    .trim()
    .toLowerCase();
  const resendRequired = emailProvider === "resend";
  if (
    !validateEnvVar(
      "RESEND_API_KEY",
      "Email delivery service (required when EMAIL_PROVIDER=resend)",
      resendRequired,
    )
  ) {
    warnings.push(
      "RESEND_API_KEY not configured - email delivery will fail when using resend",
    );
  }
  if (
    !validateEnvVar(
      "EMAIL_WEBHOOK_SECRET",
      "Email webhook signature",
      emailProvider !== "mock",
    )
  ) {
    warnings.push("EMAIL_WEBHOOK_SECRET not configured");
  }

  // === HIGH: Development Flags ===
  const devLoginEnabled = process.env.DEV_LOGIN_ENABLED === "true";
  if (devLoginEnabled && process.env.NODE_ENV === "production") {
    errors.push(
      "DEV_LOGIN_ENABLED=true in production! Must be false for security"
    );
  }

  if (process.env.NEXT_PUBLIC_AUTH_DEBUG === "1" && process.env.NODE_ENV === "production") {
    errors.push(
      "NEXT_PUBLIC_AUTH_DEBUG=1 in production! Must be unset or 0"
    );
  }

  const allowInsecureWebhooks =
    process.env.ALLOW_INSECURE_DEV_WEBHOOKS === "true";
  if (allowInsecureWebhooks && process.env.NODE_ENV === "production") {
    errors.push(
      "ALLOW_INSECURE_DEV_WEBHOOKS=true in production! Must be false"
    );
  }

  // === MEDIUM: Database ===
  if (
    !validateEnvVar(
      "SUPABASE_CONNECTION_POOLED_URL",
      "PgBouncer / pooled Supabase connection string for high concurrency",
      false
    )
  ) {
    warnings.push(
      "SUPABASE_CONNECTION_POOLED_URL not set - admin traffic will use direct connections and scale worse under concurrency"
    );
  }

  if (
    !validateEnvVar("SUPABASE_DB_PASSWORD", "Database password", false)
  ) {
    warnings.push(
      "SUPABASE_DB_PASSWORD not set - using connection via service role"
    );
  }

  // === MEDIUM: Optional Production Features ===
  const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisRestUrl || !redisRestToken) {
    warnings.push(
      "Upstash Redis REST not fully configured - edge rate limiting and session cache will fall back to local memory"
    );
  }

  const redisUrl =
    process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  if (!redisUrl && !redisRestUrl) {
    warnings.push(
      "Redis not configured - rate limiting will be in-memory only (not scalable)"
    );
  }

  const inngestEventKey = process.env.INNGEST_EVENT_KEY;
  if (!inngestEventKey) {
    warnings.push(
      "Inngest not configured - Stripe webhooks will process synchronously"
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    !validateEnvVar("BILL_AUTOPAY_CRON_SECRET", "Bill autopay cron auth", false)
  ) {
    warnings.push(
      "BILL_AUTOPAY_CRON_SECRET not set - Vercel crons for Bill Payments will fail"
    );
  }

  // === Output Results ===
  if (errors.length > 0) {
    console.error("\n❌ CRITICAL CONFIGURATION ERRORS:\n");
    errors.forEach((e) => console.error(`  • ${e}`));
    console.error("\nDeployment cannot proceed.\n");

    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }

  if (warnings.length > 0) {
    console.warn("\n⚠️  CONFIGURATION WARNINGS:\n");
    warnings.forEach((w) => console.warn(`  • ${w}`));
    console.warn("\nApplication will run but with limitations.\n");
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ All critical configurations validated successfully.");
  }

  return {
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
  };
}

// Startup validation is invoked from instrumentation.js via startup-config.js
