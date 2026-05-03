import "server-only";

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

  // === HIGH: Email & Notifications ===
  if (!validateEnvVar("RESEND_API_KEY", "Email delivery service", true)) {
    warnings.push(
      "RESEND_API_KEY not configured - email delivery will fail"
    );
  }
  if (!validateEnvVar("EMAIL_WEBHOOK_SECRET", "Email webhook signature", true)) {
    warnings.push("EMAIL_WEBHOOK_SECRET not configured");
  }

  // === HIGH: Development Flags ===
  const devLoginEnabled = process.env.DEV_LOGIN_ENABLED === "true";
  if (devLoginEnabled && process.env.NODE_ENV === "production") {
    errors.push(
      "DEV_LOGIN_ENABLED=true in production! Must be false for security"
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
    !validateEnvVar("SUPABASE_DB_PASSWORD", "Database password", false)
  ) {
    warnings.push(
      "SUPABASE_DB_PASSWORD not set - using connection via service role"
    );
  }

  // === MEDIUM: Optional Production Features ===
  const redisUrl =
    process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) {
    warnings.push(
      "Redis not configured - rate limiting will be in-memory only (not scalable)"
    );
  }

  const inngestEventKey = process.env.INNGEST_EVENT_KEY;
  if (!inngestEventKey) {
    warnings.push(
      "Inngest not configured - async webhooks will process synchronously"
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

/**
 * Run validation on startup (only in production)
 */
if (process.env.NODE_ENV === "production") {
  try {
    validateProductionConfig();
  } catch (error) {
    console.error("[Production Config] Validation failed:", error.message);
    process.exit(1);
  }
}
