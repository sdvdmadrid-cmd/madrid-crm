import { cookies } from "next/headers";
import { buildSessionCookie, createSessionToken } from "@/lib/auth";
import {
  buildAppSessionFromSupabaseUser,
  resolveProfileForUser,
} from "@/lib/supabase-auth";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-ssr";

const AUTH_DEBUG = process.env.NEXT_PUBLIC_AUTH_DEBUG === "1";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const trigger = String(body?.trigger || "unknown");

  if (AUTH_DEBUG) {
    console.info("[api/auth/sync] entry", {
      pathname: new URL(request.url).pathname,
      trigger,
      cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
    });
  }

  const cookieStore = await cookies();
  const supabase = createSupabaseRouteHandlerClient(cookieStore);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  console.info("[api/auth/sync] resolving auth session", {
    trigger,
    hasUser: Boolean(user),
    userId: user?.id || null,
    emailConfirmedAt: user?.email_confirmed_at || null,
    error: error?.message || null,
  });

  if (error || !user) {
    // Do NOT clear the app session cookie here.
    // The browser Supabase client fires onAuthStateChange with no session
    // even when a valid server-side madrid_session cookie exists (set by
    // the auth callback). Clearing the cookie here would destroy that session.
    return new Response(
      JSON.stringify({ success: true, data: { synced: false } }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!user.email_confirmed_at) {
    return new Response(
      JSON.stringify({ success: true, data: { synced: false, reason: "email_not_confirmed" } }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const profile = await resolveProfileForUser(user, {
    tenantId: user.id,
    role: user.app_metadata?.role,
  });
  const appSession = buildAppSessionFromSupabaseUser(user, null, profile);
  const token = createSessionToken(appSession);

  return new Response(
    JSON.stringify({ success: true, data: { synced: true, userId: user.id } }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": buildSessionCookie(token),
      },
    },
  );
}
