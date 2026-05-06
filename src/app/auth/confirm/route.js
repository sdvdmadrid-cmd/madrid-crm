import { NextResponse } from "next/server";

export async function GET(request) {
  const url = new URL(request.url);
  const callbackUrl = new URL("/auth/callback", url.origin);

  for (const [key, value] of url.searchParams.entries()) {
    callbackUrl.searchParams.set(key, value);
  }

  return NextResponse.redirect(callbackUrl);
}
