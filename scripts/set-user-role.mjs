/**
 * Set Supabase app_metadata.role for a user by email.
 *
 * Usage:
 *   node scripts/set-user-role.mjs admin@fieldbase.com super_admin
 *   node scripts/set-user-role.mjs sdvdmadrid@gmail.com owner
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

const email = String(process.argv[2] || "").trim().toLowerCase();
const role = String(process.argv[3] || "").trim().toLowerCase();

const ALLOWED = new Set([
  "super_admin",
  "owner",
  "admin",
  "contractor",
  "worker",
  "viewer",
]);

if (!email || !ALLOWED.has(role)) {
  console.error(
    "Usage: node scripts/set-user-role.mjs <email> <super_admin|owner|admin|contractor|worker|viewer>",
  );
  process.exit(1);
}

const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) {
  console.error("listUsers failed:", error.message);
  process.exit(1);
}

const user = (data?.users || []).find(
  (row) => String(row.email || "").toLowerCase() === email,
);

if (!user) {
  console.error("User not found:", email);
  process.exit(1);
}

const profileRole =
  role === "super_admin" ? "admin" : role === "owner" ? "admin" : role === "admin" ? "admin" : "worker";

const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: {
    ...(user.app_metadata || {}),
    role,
    tenant_db_id: user.app_metadata?.tenant_db_id || user.id,
  },
});

if (updateError) {
  console.error("auth update failed:", updateError.message);
  process.exit(1);
}

const { error: profileError } = await admin.from("profiles").upsert(
  {
    id: user.id,
    tenant_id: user.app_metadata?.tenant_db_id || user.id,
    role: profileRole,
  },
  { onConflict: "id" },
);

if (profileError) {
  console.warn("profiles upsert warning:", profileError.message);
}

console.log(`Updated ${email}`);
console.log(`  app_metadata.role → ${role}`);
console.log(`  profiles.role → ${profileRole}`);
console.log("Log out and sign in again.");
