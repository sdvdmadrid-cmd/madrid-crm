import { loadEnvLocal } from "../load-env-local.mjs";

export function loadJobberEnv(root = process.cwd()) {
  const loaded = loadEnvLocal(root);
  if (!loaded.ok) {
    throw new Error(loaded.error || ".env.local not found");
  }
  return loaded;
}

export function requireJobberOAuthEnv() {
  const missing = [];
  if (!process.env.JOBBER_CLIENT_ID) missing.push("JOBBER_CLIENT_ID");
  if (!process.env.JOBBER_CLIENT_SECRET) missing.push("JOBBER_CLIENT_SECRET");
  if (!process.env.JOBBER_REDIRECT_URI && !process.env.APP_BASE_URL) {
    missing.push("JOBBER_REDIRECT_URI or APP_BASE_URL");
  }
  if (missing.length) {
    throw new Error(`Missing Jobber env: ${missing.join(", ")}`);
  }
}

export function defaultTenantId() {
  return (
    process.env.JOBBER_TENANT_ID ||
    process.env.FIELD_BASE_TENANT_ID ||
    "d38fec7b-adac-4b7f-a46d-2ccadab6e452"
  );
}
