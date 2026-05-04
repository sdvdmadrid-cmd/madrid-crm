const FALLBACK_SECRET_KEYS = [
  "SESSION_SECRET",
  "SESSION_JWT_SECRET",
  "JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export function resolveSessionSecret() {
  for (const key of FALLBACK_SECRET_KEYS) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      return {
        value,
        source: key,
      };
    }
  }

  return {
    value: "",
    source: null,
  };
}

export function getSessionSecretHealth(minLength = 32) {
  const resolved = resolveSessionSecret();
  return {
    configured: Boolean(resolved.value),
    strong: resolved.value.length >= Number(minLength || 32),
    minLength: Number(minLength || 32),
    source: resolved.source,
  };
}
