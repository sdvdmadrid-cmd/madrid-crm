/**
 * Fix user_metadata.status from pending_verification to active.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

const env = {};
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  env[key] = value;
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USER_ID = "b0de6511-5800-4337-9880-4249ad08220b";

// Get current metadata first
const { data: userData, error: getError } = await admin.auth.admin.getUserById(USER_ID);
if (getError) {
  console.error("Failed to get user:", getError.message);
  process.exit(1);
}

const existingMeta = userData.user?.user_metadata || {};
console.log("Current user_metadata:", JSON.stringify(existingMeta, null, 2));

const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(USER_ID, {
  user_metadata: {
    ...existingMeta,
    status: "active",
    isSubscribed: false,
    trialStartDate: existingMeta.trialStartDate || new Date().toISOString(),
    trialEndDate: existingMeta.trialEndDate || trialEnd,
  },
});

if (updateError) {
  console.error("Failed to update user:", updateError.message);
  process.exit(1);
}

console.log("\n✅ Fixed! New status:", updated.user?.user_metadata?.status);
console.log("➡️  User can now log in at /login with email + password.");
