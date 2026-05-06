/**
 * Purge a user by email from Supabase Auth and local profile table.
 * Usage: node scripts/purge-user-by-email.mjs sdvdmadrid@gmail.com
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal(path = ".env.local") {
  const map = new Map();
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
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

const env = loadEnvLocal();
const supabaseUrl = env.get("NEXT_PUBLIC_SUPABASE_URL") || "";
const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const targetEmail = String(process.argv[2] || "").trim().toLowerCase();
if (!targetEmail) {
  console.error("Usage: node scripts/purge-user-by-email.mjs <email>");
  process.exit(1);
}

console.log(`Purging user for email: ${targetEmail}`);

const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) {
  console.error("Failed to list users:", listError.message);
  process.exit(1);
}

const users = listed?.users || [];
const matches = users.filter(
  (u) => String(u.email || "").trim().toLowerCase() === targetEmail,
);

if (!matches.length) {
  console.log("No Auth user found with that email. Nothing to purge.");
  process.exit(0);
}

for (const user of matches) {
  const userId = String(user.id || "").trim();
  if (!userId) continue;

  const { error: profileDeleteError } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (profileDeleteError) {
    console.warn("profiles delete warning:", profileDeleteError.message);
  } else {
    console.log(`Deleted profiles row for user ${userId}`);
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    console.error(`Failed deleting auth user ${userId}:`, authDeleteError.message);
    process.exit(1);
  }

  console.log(`Deleted auth user ${userId}`);
}

const { data: listedAfter, error: listAfterError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listAfterError) {
  console.error("Unable to verify deletion:", listAfterError.message);
  process.exit(1);
}

const remaining = (listedAfter?.users || []).some(
  (u) => String(u.email || "").trim().toLowerCase() === targetEmail,
);

if (remaining) {
  console.error("Purge incomplete: email still exists in auth.users");
  process.exit(1);
}

console.log("Purge complete: email no longer exists in auth.users");
