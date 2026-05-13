/**
 * DELETE ALL USERS EXCEPT sdvdmadrid@gmail.com
 * 
 * WARNING: This is IRREVERSIBLE. All user accounts will be deleted permanently.
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

const KEEP_EMAILS = [
  "sdvdmadrid@gmail.com",
];

console.log("🔴 DELETING ALL USERS EXCEPT:");
console.log("═══════════════════════════════════════════════════════════════");
KEEP_EMAILS.forEach(email => console.log(`  ✓ ${email}`));
console.log("\n");

let allUsers = [];
let page = 1;

// Fetch all users
while (true) {
  const { data, error } = await admin.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  
  if (error) {
    console.error("Error fetching users:", error.message);
    process.exit(1);
  }
  
  const batch = data?.users || [];
  allUsers.push(...batch);
  if (batch.length < 200) break;
  page++;
}

// Find users to delete
const toDelete = allUsers.filter(user => 
  !KEEP_EMAILS.includes(user.email?.toLowerCase())
);

console.log(`📊 Analysis:`);
console.log(`  Total users:  ${allUsers.length}`);
console.log(`  To keep:      ${KEEP_EMAILS.length}`);
console.log(`  To delete:    ${toDelete.length}`);
console.log("\n");

if (toDelete.length === 0) {
  console.log("✅ No users to delete. The system is already clean!");
  process.exit(0);
}

// Delete users
console.log("🗑️  DELETING USERS...");
console.log("═══════════════════════════════════════════════════════════════");

let deleted = 0;
let failed = 0;

for (const user of toDelete) {
  try {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.log(`  ❌ ${user.email} — Error: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✅ ${user.email}`);
      deleted++;
    }
  } catch (err) {
    console.log(`  ❌ ${user.email} — Error: ${err.message}`);
    failed++;
  }
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log(`📈 RESULTS:`);
console.log(`  Deleted:  ${deleted}/${toDelete.length}`);
console.log(`  Failed:   ${failed}/${toDelete.length}`);
console.log(`  Remaining: ${KEEP_EMAILS.length}`);
console.log("\n✅ Cleanup complete!");
