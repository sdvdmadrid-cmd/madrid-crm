import { supabaseAdmin } from "../supabase-admin-core.js";
import {
  JOBBER_CLIENT_ID,
  JOBBER_CLIENT_SECRET,
  JOBBER_OAUTH_TOKEN_URL,
  JOBBER_PROVIDER,
  JOBBER_REDIRECT_URI,
} from "./config.js";
import { jobberGraphql } from "./graphql.js";

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) return false;
  return expiryMs <= Date.now() + 60 * 1000;
}

export async function getJobberIntegrationForTenant(tenantId) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select(
      "id, tenant_id, user_id, provider, access_token, refresh_token, expires_at, metadata",
    )
    .eq("tenant_id", tenantId)
    .eq("provider", JOBBER_PROVIDER)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

export async function upsertJobberIntegration({
  userId,
  tenantId,
  accessToken,
  refreshToken,
  expiresAt,
  metadata = {},
}) {
  const { error } = await supabaseAdmin.from("integrations").upsert(
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

  if (error) throw new Error(error.message);
}

export async function deleteJobberIntegration(tenantId) {
  const { error } = await supabaseAdmin
    .from("integrations")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", JOBBER_PROVIDER);

  if (error) throw new Error(error.message);
}

async function refreshJobberAccessToken(integration) {
  if (!integration?.refresh_token) {
    throw new Error("Jobber refresh token is missing");
  }

  const body = new URLSearchParams({
    client_id: JOBBER_CLIENT_ID,
    client_secret: JOBBER_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: integration.refresh_token,
  });

  const response = await fetch(JOBBER_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokenData = await response.json().catch(() => ({}));
  if (!response.ok || !tokenData.access_token) {
    throw new Error(
      tokenData?.error_description ||
        tokenData?.error ||
        "Failed to refresh Jobber token",
    );
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;

  await upsertJobberIntegration({
    userId: integration.user_id,
    tenantId: integration.tenant_id,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || integration.refresh_token,
    expiresAt,
    metadata: integration.metadata || {},
  });

  return tokenData.access_token;
}

export async function getValidJobberAccessToken(tenantId) {
  const integration = await getJobberIntegrationForTenant(tenantId);
  if (!integration?.access_token) {
    throw new Error("Jobber is not connected for this workspace");
  }

  if (!isExpired(integration.expires_at)) {
    return integration.access_token;
  }

  return refreshJobberAccessToken(integration);
}

export async function fetchJobberAccount(accessToken) {
  const data = await jobberGraphql(
    accessToken,
    `query JobberAccount {
      account {
        id
        name
      }
    }`,
  );
  return data?.account || null;
}

export async function exchangeJobberAuthorizationCode(code) {
  const body = new URLSearchParams({
    client_id: JOBBER_CLIENT_ID,
    client_secret: JOBBER_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: JOBBER_REDIRECT_URI,
  });

  const response = await fetch(JOBBER_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokenData = await response.json().catch(() => ({}));
  if (!response.ok || !tokenData.access_token) {
    throw new Error(
      tokenData?.error_description ||
        tokenData?.error ||
        "Failed to exchange Jobber authorization code",
    );
  }

  return tokenData;
}
