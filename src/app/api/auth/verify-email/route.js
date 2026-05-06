import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/supabase-auth";

export async function GET(request) {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request) || url.origin;

  const token = String(url.searchParams.get("token") || "").trim();
  const tokenHash = String(url.searchParams.get("token_hash") || "").trim();
  const code = String(url.searchParams.get("code") || "").trim();
  const type = String(url.searchParams.get("type") || "").trim();

  const callbackUrl = new URL("/auth/callback", origin);

  if (code) {
    callbackUrl.searchParams.set("code", code);
  }

  const normalizedTokenHash = tokenHash || token;
  if (normalizedTokenHash) {
    callbackUrl.searchParams.set("token_hash", normalizedTokenHash);
    if (type) {
      callbackUrl.searchParams.set("type", type);
    }
  }

  if (!code && !normalizedTokenHash) {
    return NextResponse.redirect(new URL("/verify-email?auth_error=missing_token", origin));
  }

  return NextResponse.redirect(callbackUrl);
}
