/**
 * Count total users and break down by role/status
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
  console.log("⚠️  .env.local not found or empty");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing SUPABASE credentials in environment or .env.local");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", serviceRoleKey ? "✓" : "✗");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  // List all users from auth
  console.log("📊 Fetching user data from Supabase Auth...\n");
  
  let allUsers = [];
  let page = 1;
  const perPage = 200;
  
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    
    if (error) {
      console.error("❌ Error fetching users:", error.message);
      process.exit(1);
    }
    
    const batch = data?.users || [];
    allUsers.push(...batch);
    
    if (batch.length < perPage) break;
    page += 1;
  }
  
  // Count by role
  const byRole = {};
  const byStatus = {};
  let totalActive = 0;
  let totalTrial = 0;
  let totalExpired = 0;
  
  for (const user of allUsers) {
    const role = String(
      user?.app_metadata?.role || user?.user_metadata?.role || "contractor"
    ).toLowerCase();
    byRole[role] = (byRole[role] || 0) + 1;
    
    // Compute status
    const metadata = user?.user_metadata || {};
    let status = "unknown";
    
    if (metadata.isSubscribed === true) {
      status = "active";
      totalActive++;
    } else {
      const raw = String(metadata.status || user?.app_metadata?.status || "").toLowerCase();
      if (["active", "trial", "expired"].includes(raw)) {
        status = raw;
      } else {
        const created = new Date(user?.created_at || 0).getTime();
        const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
        status = ageDays > 30 ? "active" : "trial";
      }
    }
    
    if (status === "trial") totalTrial++;
    if (status === "expired") totalExpired++;
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  
  console.log("═══════════════════════════════════════════════════════");
  console.log(`📈 TOTAL USERS: ${allUsers.length}`);
  console.log("═══════════════════════════════════════════════════════\n");
  
  console.log("👥 By Role:");
  console.log("───────────────────────────────────────────────────────");
  for (const [role, count] of Object.entries(byRole).sort((a, b) => b[1] - a[1])) {
    const percentage = ((count / allUsers.length) * 100).toFixed(1);
    console.log(`  ${role.padEnd(15)} ${String(count).padStart(4)} (${percentage}%)`);
  }
  
  console.log("\n📊 By Status:");
  console.log("───────────────────────────────────────────────────────");
  for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    const percentage = ((count / allUsers.length) * 100).toFixed(1);
    console.log(`  ${status.padEnd(15)} ${String(count).padStart(4)} (${percentage}%)`);
  }
  
  console.log("\n💰 Subscription Status:");
  console.log("───────────────────────────────────────────────────────");
  console.log(`  Active:         ${String(totalActive).padStart(4)}`);
  console.log(`  Trial:          ${String(totalTrial).padStart(4)}`);
  console.log(`  Expired:        ${String(totalExpired).padStart(4)}`);
  
  // Get data about usage
  console.log("\n\n📦 Checking related data...");
  const { data: clients } = await admin.from("clients").select("id", { count: "exact" });
  const { data: jobs } = await admin.from("jobs").select("id", { count: "exact" });
  const { data: invoices } = await admin.from("invoices").select("id", { count: "exact" });
  const { data: estimates } = await admin.from("estimates").select("id", { count: "exact" });
  const { data: bills } = await admin.from("bills").select("id", { count: "exact" });
  
  console.log("───────────────────────────────────────────────────────");
  console.log(`  Clients:        ${(clients?.length || 0)}`);
  console.log(`  Jobs:           ${(jobs?.length || 0)}`);
  console.log(`  Invoices:       ${(invoices?.length || 0)}`);
  console.log(`  Estimates:      ${(estimates?.length || 0)}`);
  console.log(`  Bills:          ${(bills?.length || 0)}`);
  
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("✅ User count complete!");
  
} catch (error) {
  console.error("❌ Fatal error:", error.message);
  process.exit(1);
}
