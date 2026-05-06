/**
 * One-shot script: inspect + force-confirm a Supabase user by email.
 * Usage: node scripts/fix-user-verify.mjs sdvdmadrid@gmail.com
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

// Load .env.local manually
const envRaw = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envRaw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  env[key] = value;
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const targetEmail = (process.argv[2] || "sdvdmadrid@gmail.com").trim().toLowerCase();

console.log(`\n🔍 Checking user: ${targetEmail}\n`);

// List all users and find target
const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error("❌ Failed to list users:", listError.message);
  process.exit(1);
}

const user = listData.users.find(u => u.email?.toLowerCase() === targetEmail);
if (!user) {
  console.error(`❌ User not found: ${targetEmail}`);
  process.exit(1);
}

console.log("📋 Current state:");
console.log("  ID:                  ", user.id);
console.log("  Email:               ", user.email);
console.log("  email_confirmed_at:  ", user.email_confirmed_at || "NOT CONFIRMED ❌");
console.log("  created_at:          ", user.created_at);
console.log("  last_sign_in_at:     ", user.last_sign_in_at || "never");
console.log("  role (app_metadata): ", user.app_metadata?.role || "none");
console.log("  status (meta):       ", user.user_metadata?.status || "none");
console.log("  banned_until:        ", user.banned_until || "not banned");
console.log("");

if (user.email_confirmed_at) {
  console.log("✅ Email is already confirmed.\n");
  console.log("➡️  The user should be able to log in directly.");
  console.log("   If they can't, the issue is session/cookie/password — NOT verification.\n");
  process.exit(0);
}

// Force confirm
console.log("🔧 Forcing email confirmation...");
const { data: updateData, error: updateError } = await admin.auth.admin.updateUserById(user.id, {
  email_confirm: true,
  user_metadata: {
    ...user.user_metadata,
    status: "active",
  },
});

if (updateError) {
  console.error("❌ Failed to confirm user:", updateError.message);
  process.exit(1);
}

console.log("✅ User confirmed successfully!");
console.log("  email_confirmed_at:", updateData.user?.email_confirmed_at);
console.log("\n➡️  The user can now log in with their email and password.");
console.log("   NO need to click a verification link anymore.\n");
