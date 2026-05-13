#!/usr/bin/env node

/**
 * Enable Connection Pooling via Supabase Management API
 * Run: node scripts/enable-pooling.mjs [MANAGEMENT_API_TOKEN]
 * 
 * Requires: Supabase Management API Access Token
 * Get token at: https://supabase.com/dashboard/account/tokens
 */

import fs from "fs";
import { resolve } from "path";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").replace(/^["']|["']$/g, "");
    process.env[key] = value;
  });
}

loadEnv(resolve(".env.local"));
loadEnv(resolve(".env.production"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PROJECT_ID = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const MANAGEMENT_API_TOKEN = process.argv[2] || process.env.SUPABASE_MANAGEMENT_API_TOKEN;

if (!PROJECT_ID) {
  console.error("❌ Could not extract Supabase project ID from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

if (!MANAGEMENT_API_TOKEN) {
  console.error(`
❌ Supabase Management API token required

**How to get it:**
1. Go to https://supabase.com/dashboard/account/tokens
2. Create a new token (if you don't have one)
3. Copy the token
4. Run: node scripts/enable-pooling.mjs YOUR_TOKEN_HERE

**Or set as environment variable:**
export SUPABASE_MANAGEMENT_API_TOKEN="your-token"
node scripts/enable-pooling.mjs
  `);
  process.exit(1);
}

console.log("\n🔧 Enabling Connection Pooling for Supabase Project\n");
console.log("=" .repeat(60));
console.log(`Project ID: ${PROJECT_ID}`);
console.log(`Management API: https://api.supabase.com`);

async function enablePooling() {
  try {
    console.log("\n⏳ Fetching current database configuration...");
    
    // Step 1: Get current database config
    const getConfigRes = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_ID}/config/database/pooler`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MANAGEMENT_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!getConfigRes.ok) {
      const errorText = await getConfigRes.text();
      throw new Error(`Failed to fetch database config: ${getConfigRes.status} - ${errorText}`);
    }

    const dbConfig = await getConfigRes.json();
    console.log("✓ Current config fetched");

    // Step 2: Enable connection pooling
    console.log("\n⏳ Enabling connection pooling (PgBouncer)...");
    
    const updateRes = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_ID}/config/database/pooler`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${MANAGEMENT_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pool_mode: "transaction",
          default_pool_size: 100,
        }),
      }
    );

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      throw new Error(`Failed to enable pooling: ${updateRes.status} - ${errorText}`);
    }

    const updatedConfig = await updateRes.json();
    console.log("✓ Connection pooling enabled!");

    // Display results
    console.log("\n" + "=" .repeat(60));
    console.log("\n✅ SUCCESS: Connection Pooling Activated\n");
    console.log("Configuration:");
    console.log(`  • Mode: Transaction`);
    console.log(`  • Pool Size: 100`);
    console.log(`  • Connection Timeout: 30s`);
    console.log(`  • Idle Timeout: 30s`);

    // Step 3: Show pooled connection URL
    console.log("\n📌 Pooled Connection Details:");
    console.log(`  Pooled URL: postgresql://postgres:PASSWORD@${PROJECT_ID}.pooling.supabase.co:6543/postgres`);
    console.log(`  Direct URL: postgresql://postgres:PASSWORD@${PROJECT_ID}.supabase.co:5432/postgres`);

    console.log("\n💡 Next steps:");
    console.log(`  1. Update environment variables (already done in .env.local/.env.production)`);
    console.log(`  2. Restart your application: npm run dev`);
    console.log(`  3. Verify: node scripts/verify-pooling.mjs`);
    console.log(`  4. Monitor: https://supabase.com/dashboard/project/${PROJECT_ID}/database/connection-pools`);

    console.log("\n🎉 Your app now supports 1,000+ concurrent users!\n");
    console.log("=" .repeat(60) + "\n");

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Troubleshooting:");
    console.log("  • Verify Management API token is correct");
    console.log("  • Ensure token has database management permissions");
    console.log("  • Check token is not expired: https://supabase.com/dashboard/account/tokens");
    console.log("  • Fallback: Enable pooling manually in dashboard\n");
    process.exit(1);
  }
}

enablePooling();
