import { NextResponse } from "next/server";
import { parseCookieHeader, verifySessionToken } from "@/lib/auth";
import {
  getGoogleIntegration,
  upsertGoogleIntegration,
} from "@/lib/google-calendar";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:3000/api/integrations/google/callback";
const GOOGLE_OAUTH_COOKIE = "google_oauth_nonce";

function clearOauthCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GOOGLE_OAUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function GET(req) {
  const context = await getAuthenticatedTenantContext(req);
  if (!context?.authenticated || !context.userId) {
    return unauthenticatedResponse();
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    const response = NextResponse.redirect(new URL("/?google=denied", req.url));
    response.headers.append("Set-Cookie", clearOauthCookie());
    return response;
  }

  if (!code || !state) {
    return NextResponse.json(
      { success: false, error: "Missing code or state" },
      { status: 400 },
    );
  }

  const statePayload = verifySessionToken(state);
  const cookieMap = parseCookieHeader(req.headers.get("cookie") || "");
  const cookieNonce = cookieMap[GOOGLE_OAUTH_COOKIE] || "";

  if (
    !statePayload ||
    statePayload.type !== "google_oauth" ||
    statePayload.userId !== context.userId ||
    !cookieNonce ||
    cookieNonce !== statePayload.nonce
  ) {
    const response = NextResponse.json(
      { success: false, error: "Invalid Google OAuth state" },
      { status: 400 },
    );
    response.headers.append("Set-Cookie", clearOauthCookie());
    return response;
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID || "",
      client_secret: GOOGLE_CLIENT_SECRET || "",
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    const response = NextResponse.json(
      {
        success: false,
        error: tokenData?.error_description || "Failed to exchange Google code",
      },
      { status: 400 },
    );
    response.headers.append("Set-Cookie", clearOauthCookie());
    return response;
  }

  const existing = await getGoogleIntegration({
    userId: context.userId,
    tenantId: context.tenantDbId,
  });

  const { error } = await upsertGoogleIntegration({
    userId: context.userId,
    tenantId: context.tenantDbId,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || existing?.refresh_token || null,
    expiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null,
  });

  if (error) {
    const response = NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
    response.headers.append("Set-Cookie", clearOauthCookie());
    return response;
  }

  const response = NextResponse.redirect(
    new URL("/?google=connected", req.url),
  );
  response.headers.append("Set-Cookie", clearOauthCookie());
  return response;
}
