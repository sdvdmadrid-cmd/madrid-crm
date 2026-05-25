const PUBLIC_KEY_ENV = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const LEGACY_ANON_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

export function getSupabasePublicKeyEnv() {
  const publishableKey = String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (publishableKey) {
    return {
      key: publishableKey,
      envName: PUBLIC_KEY_ENV,
      usingLegacyAnonKey: false,
    };
  }

  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return {
    key: anonKey,
    envName: anonKey ? LEGACY_ANON_KEY_ENV : "",
    usingLegacyAnonKey: Boolean(anonKey),
  };
}

export function getSupabasePublicConfig() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const publicKey = getSupabasePublicKeyEnv();

  if (!supabaseUrl || !publicKey.key) {
    throw new Error(
      `Missing NEXT_PUBLIC_SUPABASE_URL or ${PUBLIC_KEY_ENV} (legacy fallback: ${LEGACY_ANON_KEY_ENV})`,
    );
  }

  return {
    supabaseUrl,
    supabasePublishableKey: publicKey.key,
    supabasePublicKeyEnv: publicKey.envName,
    usingLegacySupabaseAnonKey: publicKey.usingLegacyAnonKey,
  };
}

export function getSupabaseProjectRefFromUrl(value) {
  try {
    const hostname = new URL(String(value || "")).hostname;
    const [ref] = hostname.split(".");
    return ref || "";
  } catch {
    return "";
  }
}

export function decodeSupabaseJwtRef(value) {
  try {
    const parts = String(value || "").split(".");
    if (parts.length !== 3) return "";
    const payloadJson =
      typeof Buffer !== "undefined"
        ? Buffer.from(parts[1], "base64url").toString("utf8")
        : atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    return String(payload?.ref || "").trim();
  } catch {
    return "";
  }
}
