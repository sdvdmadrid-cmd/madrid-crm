import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed
    .slice(eqIdx + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = (process.argv[2] || "").trim().toLowerCase();
const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
const user = data.users.find((u) => u.email?.toLowerCase() === email);
if (!user) {
  console.log("NOT_FOUND");
  process.exit(1);
}

const [{ data: profile }, { data: company }] = await Promise.all([
  admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  admin.from("company_profiles").select("*").eq("tenant_id", user.id).maybeSingle(),
]);

console.log(
  JSON.stringify(
    {
      id: user.id,
      email: user.email,
      email_confirmed_at: user.email_confirmed_at,
      last_sign_in_at: user.last_sign_in_at,
      role: user.app_metadata?.role,
      user_metadata: user.user_metadata,
      profile,
      company_profiles: company,
    },
    null,
    2,
  ),
);
