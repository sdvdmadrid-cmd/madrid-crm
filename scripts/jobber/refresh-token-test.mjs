#!/usr/bin/env node
/**
 * Verify Jobber refresh token flow for the stored integration.
 */
import { getValidJobberAccessToken, getJobberIntegrationForTenant } from "../../src/lib/jobber/oauth.js";
import { loadJobberEnv, defaultTenantId } from "./_env.mjs";

loadJobberEnv();

const tenantId = process.argv[2] || defaultTenantId();

const before = await getJobberIntegrationForTenant(tenantId);
if (!before?.refresh_token) {
  console.error("No refresh_token stored. Re-connect Jobber OAuth.");
  process.exit(1);
}

const token = await getValidJobberAccessToken(tenantId);
const after = await getJobberIntegrationForTenant(tenantId);

console.log(
  JSON.stringify(
    {
      ok: Boolean(token),
      tokenRotated: before.access_token !== after.access_token,
      refreshPersisted: Boolean(after.refresh_token),
      expiresAt: after.expires_at,
    },
    null,
    2,
  ),
);
