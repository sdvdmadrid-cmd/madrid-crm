// Fix existing users who have role=admin from self-signup → role=owner
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Find all users whose app_metadata.role is "admin" (self-signup owners)
// and update them to "owner". Skip super_admin.
const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/fix-role-to-owner.mjs <email>");
  process.exit(1);
}

// Find user by email
const { data: { users }, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) { console.error("listUsers error:", listError.message); process.exit(1); }

const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.error("User not found:", email); process.exit(1); }

console.log("Current app_metadata.role:", user.app_metadata?.role);

const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: "owner" },
});

if (updateError) {
  console.error("Update error:", updateError.message);
  process.exit(1);
}

// Also update profiles table if it has a role column
const { error: profileError } = await admin
  .from("profiles")
  .update({ role: "owner" })
  .eq("user_id", user.id);

if (profileError && !profileError.message.includes("column")) {
  console.warn("Profile update warning:", profileError.message);
}

console.log(`✅ Updated ${email} → role=owner`);
console.log("Log out and back in for the change to take effect.");
