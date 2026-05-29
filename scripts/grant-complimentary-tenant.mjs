#!/usr/bin/env node
/**
 * One-time / maintenance: mark a tenant + auth user as complimentary (free forever).
 *
 * Usage:
 *   node scripts/grant-complimentary-tenant.mjs d38fec7b-adac-4b7f-a46d-2ccadab6e452
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

const tenantId = String(process.argv[2] || "").trim();
if (!tenantId) {
  console.error("Usage: node scripts/grant-complimentary-tenant.mjs <tenant-uuid>");
  process.exit(1);
}

loadEnvLocal(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profiles, error: profileError } = await supabase
  .from("profiles")
  .select("id, tenant_id, role")
  .eq("tenant_id", tenantId);

if (profileError) {
  console.error("profiles:", profileError.message);
  process.exit(1);
}

const userIds = [...new Set((profiles || []).map((row) => row.id).filter(Boolean))];
if (userIds.length === 0) {
  console.error("No profiles found for tenant", tenantId);
  process.exit(1);
}

for (const userId of userIds) {
  const { data: userData, error: getUserError } =
    await supabase.auth.admin.getUserById(userId);
  if (getUserError) {
    console.error(`getUser ${userId}:`, getUserError.message);
    continue;
  }

  const existing = userData?.user?.user_metadata || {};
  const { error: updateUserError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existing,
      isSubscribed: true,
      billPaymentsSubscribed: true,
      complimentaryAccess: true,
      trialEndDate: null,
    },
  });

  if (updateUserError) {
    console.error(`updateUser ${userId}:`, updateUserError.message);
  } else {
    console.log(`auth user ${userId}: complimentary metadata applied`);
  }
}

const { data: subs, error: subListError } = await supabase
  .from("contractor_subscriptions")
  .select("id, status, metadata")
  .eq("tenant_id", tenantId);

if (subListError) {
  console.error("contractor_subscriptions list:", subListError.message);
  process.exit(1);
}

for (const sub of subs || []) {
  const { error: subUpdateError } = await supabase
    .from("contractor_subscriptions")
    .update({
      status: "active",
      trial_ends_at: null,
      metadata: { ...(sub.metadata || {}), complimentary: true },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  if (subUpdateError) {
    console.error(`subscription ${sub.id}:`, subUpdateError.message);
  } else {
    console.log(`subscription ${sub.id}: status=active, complimentary=true`);
  }
}

console.log("Done for tenant", tenantId);
