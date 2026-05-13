import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

function loadEnvFile(filePath) {
  const env = {};
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");
    env[key] = value;
  }
  return env;
}

const targetEmail = String(process.argv[2] || "").trim().toLowerCase();
const targetRole = String(process.argv[3] || "super_admin").trim().toLowerCase();
const providedPassword = String(process.argv[4] || "").trim();

if (!targetEmail) {
  console.error("Usage: node scripts/unlock-owner-access.mjs <email> [role]");
  process.exit(1);
}

const env = loadEnvFile(envPath);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function generateTempPassword() {
  const chunk = Math.random().toString(36).slice(2, 10);
  return `FieldBase!${chunk}9`;
}

const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error("listUsers error:", listError.message);
  process.exit(1);
}

let user = (listData?.users || []).find((u) => String(u.email || "").toLowerCase() === targetEmail);
let createdNow = false;
let tempPassword = "";

if (!user) {
  tempPassword = providedPassword || generateTempPassword();
  const { data: createdData, error: createError } = await admin.auth.admin.createUser({
    email: targetEmail,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { role: targetRole },
    user_metadata: { status: "active" },
  });

  if (createError) {
    console.error("createUser error:", createError.message);
    process.exit(1);
  }

  user = createdData?.user || null;
  createdNow = true;
}

if (!user) {
  console.error("User not found and could not be created:", targetEmail);
  process.exit(1);
}

console.log("Found:", user.email, "| role:", user.app_metadata?.role || "none", "| status:", user.user_metadata?.status || "none");

const nextUserMetadata = {
  ...(user.user_metadata || {}),
  status: "active",
};

const nextAppMetadata = {
  ...(user.app_metadata || {}),
  role: targetRole,
};

const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(user.id, {
  email_confirm: true,
  app_metadata: nextAppMetadata,
  user_metadata: nextUserMetadata,
});

if (updateError) {
  console.error("updateUserById error:", updateError.message);
  process.exit(1);
}

const { error: profileError } = await admin
  .from("profiles")
  .update({ role: targetRole })
  .eq("user_id", user.id);

if (profileError && !String(profileError.message || "").toLowerCase().includes("column")) {
  console.warn("profiles update warning:", profileError.message);
}

const refreshedRole = updatedData?.user?.app_metadata?.role || targetRole;
const refreshedStatus = updatedData?.user?.user_metadata?.status || "active";
const confirmedAt = updatedData?.user?.email_confirmed_at || "confirmed";

console.log("OK: access unlocked");
console.log("email:", targetEmail);
console.log("role:", refreshedRole);
console.log("status:", refreshedStatus);
console.log("email_confirmed_at:", confirmedAt);
if (createdNow) {
  console.log("created:", true);
  console.log("temporary_password:", tempPassword);
}
console.log("If you still cannot access, log out and back in to refresh session claims.");
