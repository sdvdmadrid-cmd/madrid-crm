#!/usr/bin/env node

/**
 * Verify Connection Pooling Status
 * Run: node scripts/verify-pooling.mjs
 * 
 * Checks if Supabase pooling is properly configured and working.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

const pooledUrl = process.env.SUPABASE_CONNECTION_POOLED_URL;
const directUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY not found in environment");
  process.exit(1);
}

console.log("\n🔍 Connection Pooling Verification\n");
console.log("=" .repeat(60));

// Test pooled connection if available
if (pooledUrl) {
  console.log("\n✓ Pooled URL configured:");
  console.log(`  ${pooledUrl.replace(/:\w+@/, ":***@")}`);
  
  console.log("\n⏳ Testing pooled connection...");
  try {
    const pooledClient = createClient(pooledUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    
    const { count, error } = await pooledClient
      .from("profiles")
      .select("*", { count: "exact", head: true });
    
    if (error) {
      console.error(`❌ Pooled connection test failed: ${error.message}`);
    } else {
      console.log("✅ Pooled connection working!");
      console.log(`   Sample query: profiles table has ${count || 0} rows`);
    }
  } catch (err) {
    console.error(`❌ Pooled connection error: ${err.message}`);
    console.log("   → Check Supabase dashboard Settings → Database → Connection Pooling");
  }
} else {
  console.log("⚠️  SUPABASE_CONNECTION_POOLED_URL not configured");
  console.log("   To enable: Follow POOLING_ACTIVATION_GUIDE.md");
}

// Show direct connection for reference
if (directUrl) {
  console.log("\n📌 Direct URL (fallback):");
  console.log(`  ${directUrl}`);
}

console.log("\n" + "=" .repeat(60));
console.log("\n💡 Next steps:");
console.log("  1. Enable pooling in Supabase Dashboard");
console.log("  2. Update SUPABASE_CONNECTION_POOLED_URL in .env");
console.log("  3. Restart your application");
console.log("  4. Run this script again to verify\n");

process.exit(pooledUrl ? 0 : 1);
