#!/usr/bin/env node
import fs from "node:fs";

function loadEnv(path) {
  const out = {};
  if (!fs.existsSync(path)) return out;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(".env.production"), ...loadEnv(".env.local") };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const res = await fetch(
  `${url}/rest/v1/platform_feature_flags?select=key,enabled,description`,
  {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  },
);

if (!res.ok) {
  console.error("Supabase error", res.status, await res.text());
  process.exit(1);
}

const rows = await res.json();
const disabled = rows.filter((r) => r.enabled === false);
console.log("feature_website_builder:", rows.find((r) => r.key === "feature_website_builder"));
console.log("Disabled flags:", disabled.length ? disabled.map((r) => r.key) : "(none)");
