import { cookies } from "next/headers";
import {
  buildLogoutGuardCookie,
  clearLogoutGuardCookie,
  clearSessionCookie,
} from "@/lib/auth";
import { invalidateCachedSession } from "@/lib/session-cache";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-ssr";

function jsonResponse(body, status, extraCookies = []) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const cookie of extraCookies) {
    if (cookie) headers.append("Set-Cookie", cookie);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export async function POST(request) {
  try {
    const cookie =
      request.cookies.get("__Host-madrid_session")?.value ||
      request.cookies.get("madrid_session")?.value;
    if (cookie) {
      await invalidateCachedSession(cookie);
    }

    try {
      const cookieStore = await cookies();
      const supabase = createSupabaseRouteHandlerClient(cookieStore);
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.warn("[api/auth/logout] supabase signOut failed", signOutError?.message);
    }

    return jsonResponse({ success: true }, 200, [
      clearSessionCookie(),
      buildLogoutGuardCookie(),
    ]);
  } catch (error) {
    console.error("[api/auth/logout] error", error);
    return jsonResponse(
      { success: false, error: error?.message || "Unable to log out" },
      500,
    );
  }
}
