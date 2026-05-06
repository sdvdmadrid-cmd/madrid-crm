import fs from "node:fs";

function readEnv() {
  const lines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
  const map = new Map();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, "");
    map.set(key, value);
  }
  return map;
}

function mask(value) {
  const raw = String(value || "");
  if (!raw) return "(missing)";
  if (raw.length < 16) return `${raw.slice(0, 3)}...${raw.slice(-2)}`;
  return `${raw.slice(0, 10)}...${raw.slice(-8)}`;
}

function decodeJwtPayload(value) {
  try {
    const parts = String(value || "").split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const env = readEnv();
const supabaseUrl = env.get("NEXT_PUBLIC_SUPABASE_URL") || "";
const publishable = env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || "";
const anon = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") || "";
const serviceRole = env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const appUrl = env.get("APP_URL") || "";
const appBaseUrl = env.get("APP_BASE_URL") || "";

console.log("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl || "(missing)");
console.log("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:", mask(publishable));
console.log("NEXT_PUBLIC_SUPABASE_ANON_KEY:", mask(anon));
console.log("SUPABASE_SERVICE_ROLE_KEY:", mask(serviceRole));
console.log("APP_URL:", appUrl || "(missing)");
console.log("APP_BASE_URL:", appBaseUrl || "(missing)");

const refFromUrl = (supabaseUrl.match(/https:\/\/([^.]+)\./) || [])[1] || "(unknown)";
console.log("project_ref_from_url:", refFromUrl);

for (const [name, token] of [
  ["publishable", publishable],
  ["anon", anon],
  ["service_role", serviceRole],
]) {
  const payload = decodeJwtPayload(token);
  console.log(`${name}_jwt_ref:`, payload?.ref || "(n/a)");
  console.log(`${name}_jwt_aud:`, payload?.aud || "(n/a)");
  console.log(`${name}_jwt_role:`, payload?.role || "(n/a)");
}

if (!supabaseUrl || !serviceRole) {
  console.log("settings_fetch: skipped (missing URL or service role key)");
  process.exit(0);
}

try {
  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  console.log("settings_status:", response.status);
  console.log("settings_site_url:", body.SITE_URL || body.site_url || "(not returned)");
  const allowList = body.URI_ALLOW_LIST || body.uri_allow_list || body.URI_ALLOWLIST || [];
  console.log("settings_redirect_allow_list:", Array.isArray(allowList) ? allowList : body);
} catch (error) {
  console.log("settings_fetch_error:", error?.message || "unknown_error");
}
