import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:3000/api/integrations/google/callback";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function isExpired(expiresAt) {
  if (!expiresAt) {
    return false;
  }

  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) {
    return false;
  }

  return expiryMs <= Date.now() + 60 * 1000;
}

export async function getGoogleIntegration({ userId, tenantId = null }) {
  let query = supabaseAdmin
    .from("integrations")
    .select(
      "id, tenant_id, user_id, provider, access_token, refresh_token, expires_at",
    )
    .eq("user_id", userId)
    .eq("provider", "google");

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

export async function upsertGoogleIntegration({
  userId,
  tenantId,
  accessToken,
  refreshToken,
  expiresAt,
}) {
  return await supabaseAdmin.from("integrations").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      provider: "google",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
}

async function refreshGoogleAccessToken(integration) {
  if (!integration?.refresh_token) {
    throw new Error("Google refresh token is missing");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID || "",
      client_secret: GOOGLE_CLIENT_SECRET || "",
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      tokenData?.error_description || "Failed to refresh Google token",
    );
  }

  const nextIntegration = {
    ...integration,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || integration.refresh_token,
    expires_at: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : integration.expires_at,
  };

  const { error } = await upsertGoogleIntegration({
    userId: integration.user_id,
    tenantId: integration.tenant_id,
    accessToken: nextIntegration.access_token,
    refreshToken: nextIntegration.refresh_token,
    expiresAt: nextIntegration.expires_at,
  });

  if (error) {
    throw new Error(error.message);
  }

  return nextIntegration;
}

async function getValidGoogleIntegration({ userId, tenantId = null }) {
  const integration = await getGoogleIntegration({ userId, tenantId });
  if (!integration) {
    throw new Error("Google integration not found");
  }

  if (!integration.access_token || isExpired(integration.expires_at)) {
    return await refreshGoogleAccessToken(integration);
  }

  return integration;
}

export async function createGoogleCalendarEvent({
  userId,
  tenantId,
  summary,
  location,
  description,
  start,
  end,
}) {
  let integration = await getValidGoogleIntegration({ userId, tenantId });

  let res = await fetch(GOOGLE_EVENTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ summary, location, description, start, end }),
  });

  if (res.status === 401 && integration.refresh_token) {
    integration = await refreshGoogleAccessToken(integration);
    res = await fetch(GOOGLE_EVENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ summary, location, description, start, end }),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Google Calendar event: ${body}`);
  }

  return await res.json();
}
