import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Use the management API to run raw SQL via pg_meta
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1];
const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const apiKey = serviceRoleKey; // for self-hosted; for cloud use management token if needed

// Try via rpc first (requires pg_net or exec function)
// Instead use supabase-js admin directly — it can't run DDL.
// Correct approach: use the Supabase Management API
const resp = await fetch(mgmtUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
  },
  body: JSON.stringify({ query: "ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;" }),
});

if (resp.ok) {
  const body = await resp.json();
  console.log("✅ RLS enabled on auth_rate_limits:", body);
} else {
  const text = await resp.text();
  console.log(`Management API status ${resp.status}:`, text);
  console.log("\nApply this SQL manually in Supabase Dashboard > SQL Editor:");
  console.log("  ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;");
}
