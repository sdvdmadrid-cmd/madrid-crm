#!/usr/bin/env node
/**
 * Run full Jobber → FieldBase sync from CLI (requires stored integration tokens).
 * Usage: node scripts/jobber/run-sync.mjs [tenant_id]
 */
import { createClient } from "@supabase/supabase-js";
import { runJobberFullSync } from "../../src/lib/jobber/sync.js";
import { loadJobberEnv, defaultTenantId } from "./_env.mjs";
import { JOBBER_PROVIDER } from "../../src/lib/jobber/config.js";

loadJobberEnv();

const tenantId = process.argv[2] || defaultTenantId();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: integration, error } = await supabase
  .from("integrations")
  .select("user_id, access_token, refresh_token")
  .eq("tenant_id", tenantId)
  .eq("provider", JOBBER_PROVIDER)
  .maybeSingle();

if (error) {
  console.error(error.message);
  process.exit(1);
}

if (!integration?.access_token) {
  console.error(
    "No Jobber tokens for tenant. Connect via UI or run: npm run jobber:store-tokens",
  );
  process.exit(1);
}

console.log(`Starting Jobber sync for tenant ${tenantId}...`);
const summary = await runJobberFullSync({
  tenantId,
  userId: integration.user_id,
});

console.log(JSON.stringify({ ok: true, tenantId, summary }, null, 2));

if (summary.errors?.length) {
  console.error(`\n${summary.errors.length} entity error(s) — see summary.errors`);
  process.exit(2);
}
