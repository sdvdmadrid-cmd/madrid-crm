/**
 * List auth users matching optional email substring.
 * Usage: node scripts/list-user-roles.mjs [filter]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const filter = String(process.argv[2] || "").trim().toLowerCase();

const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) {
  console.error(error.message);
  process.exit(1);
}

for (const user of data?.users || []) {
  const email = String(user.email || "").toLowerCase();
  if (filter && !email.includes(filter)) continue;
  const { data: profile } = await admin
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  console.log(email);
  console.log(`  app_metadata.role: ${user.app_metadata?.role || "(none)"}`);
  console.log(`  profiles.role: ${profile?.role || "(none)"}`);
}
