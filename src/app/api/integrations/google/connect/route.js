import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:3000/api/integrations/google/callback";
const GOOGLE_OAUTH_COOKIE = "google_oauth_nonce";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"].join(" ");

function buildOauthCookie(value, maxAgeSeconds = 600) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export async function GET(request) {
  const context = await getAuthenticatedTenantContext(request);
  if (!context?.authenticated || !context.userId) {
    return unauthenticatedResponse();
  }

  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { success: false, error: "GOOGLE_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  const nonce = crypto.randomBytes(24).toString("hex");
  const state = createSessionToken({
    type: "google_oauth",
    nonce,
    userId: context.userId,
    tenantDbId: context.tenantDbId,
  });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const response = NextResponse.redirect(url);
  response.headers.append("Set-Cookie", buildOauthCookie(nonce));
  return response;
}
