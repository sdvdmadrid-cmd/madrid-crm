/**
 * List all users to identify which ones to keep/delete
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

const env = {};
try {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
  }
} catch (err) {
  console.log("⚠️  .env.local not found");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("📋 All Users in the System:\n");
console.log("═══════════════════════════════════════════════════════════════");

let allUsers = [];
let page = 1;

while (true) {
  const { data, error } = await admin.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  
  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
  
  const batch = data?.users || [];
  allUsers.push(...batch);
  if (batch.length < 200) break;
  page++;
}

allUsers.forEach((user, i) => {
  const role = String(user?.app_metadata?.role || "unknown").toLowerCase();
  const email = user?.email || "NO EMAIL";
  const status = user?.user_metadata?.status || "unknown";
  const created = new Date(user?.created_at).toLocaleDateString();
  
  console.log(`${i + 1}. ${email.padEnd(35)} | Role: ${role.padEnd(12)} | Status: ${status.padEnd(10)} | Created: ${created}`);
  console.log(`   ID: ${user.id}`);
  console.log("");
});

console.log("═══════════════════════════════════════════════════════════════");
console.log(`Total: ${allUsers.length} users`);
