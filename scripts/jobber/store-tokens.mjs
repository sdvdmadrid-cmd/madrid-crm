#!/usr/bin/env node
/**
 * Store Jobber OAuth tokens for a tenant (after manual OAuth or token export).
 *
 * Required env:
 *   JOBBER_ACCESS_TOKEN
 *   JOBBER_REFRESH_TOKEN (recommended)
 *   JOBBER_TENANT_ID (optional, defaults to primary tenant)
 *   JOBBER_USER_ID (optional; resolved from integrations or first auth user)
 *
 * Optional: JOBBER_TOKEN_EXPIRES_IN (seconds)
 */
import { createClient } from "@supabase/supabase-js";
import { loadJobberEnv, defaultTenantId } from "./_env.mjs";
import { fetchJobberAccount } from "../../src/lib/jobber/oauth.js";
import { JOBBER_PROVIDER } from "../../src/lib/jobber/config.js";

loadJobberEnv();

const accessToken = process.env.JOBBER_ACCESS_TOKEN;
const refreshToken = process.env.JOBBER_REFRESH_TOKEN || "";
const tenantId = defaultTenantId();
const expiresIn = Number(process.env.JOBBER_TOKEN_EXPIRES_IN || 0);

if (!accessToken) {
  console.error("Set JOBBER_ACCESS_TOKEN in .env.local");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = process.env.JOBBER_USER_ID || "";

if (!userId) {
  const { data: existing } = await supabase
    .from("integrations")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("provider", JOBBER_PROVIDER)
    .maybeSingle();
  userId = existing?.user_id || "";
}

if (!userId) {
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1 });
  userId = users?.users?.[0]?.id || "";
}

if (!userId) {
  console.error("Set JOBBER_USER_ID to the FieldBase user who owns this workspace.");
  process.exit(1);
}

let account = null;
try {
  account = await fetchJobberAccount(accessToken);
} catch (err) {
  console.warn("Could not fetch Jobber account (token may still be valid):", err.message);
}

const expiresAt = expiresIn
  ? new Date(Date.now() + expiresIn * 1000).toISOString()
  : null;

const metadata = {
  accountId: account?.id || "",
  accountName: account?.name || "",
  connectedVia: "cli-store-tokens",
  connectedAt: new Date().toISOString(),
};

const { error } = await supabase.from("integrations").upsert(
  {
    tenant_id: tenantId,
    user_id: userId,
    provider: JOBBER_PROVIDER,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    metadata,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "user_id,provider" },
);

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      tenantId,
      userId,
      accountName: metadata.accountName,
      hasRefreshToken: Boolean(refreshToken),
    },
    null,
    2,
  ),
);
