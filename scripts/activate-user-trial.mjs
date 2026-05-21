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
  console.error("User not found");
  process.exit(1);
}

const now = new Date();
const trialEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
const meta = user.user_metadata || {};

await admin.auth.admin.updateUserById(user.id, {
  user_metadata: {
    ...meta,
    status: "active",
    trialStartDate: meta.trialStartDate || now.toISOString(),
    trialEndDate: meta.trialEndDate || trialEnd.toISOString(),
  },
});

const companyName = meta.companyName || "";
const businessType = meta.businessType || "";
if (companyName || businessType) {
  await admin.from("company_profiles").upsert(
    {
      tenant_id: user.id,
      company_name: companyName,
      business_type: businessType,
      updated_at: now.toISOString(),
    },
    { onConflict: "tenant_id" },
  );
}

console.log("Activated", email, "trial until", trialEnd.toISOString());
