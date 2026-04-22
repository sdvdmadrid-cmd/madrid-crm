import { buildSessionCookie, createSessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildAppSessionFromSupabaseUser,
  createSupabaseServerAuthClient,
  getRequestOrigin,
  normalizeAuthUser,
  resolveProfileForUser,
} from "@/lib/supabase-auth";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = (searchParams.get("token") || "").trim();

    const origin = getRequestOrigin(request);
    if (!origin) {
      throw new Error("APP_URL must be configured for verification redirects");
    }

    if (!token) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${origin}/verify-email?error=missing_token` },
      });
    }

    const authClient = createSupabaseServerAuthClient();
    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: token,
      type: "signup",
    });

    if (error || !data?.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${origin}/verify-email?error=invalid_token` },
      });
    }

    const now = new Date();
    const normalized = normalizeAuthUser(data.user);
    const hasTrial = Boolean(normalized.userMetadata.trialEndDate);
    const trialStartDate = hasTrial
      ? normalized.userMetadata.trialStartDate || now.toISOString()
      : now.toISOString();
    const trialEndDate = hasTrial
      ? normalized.userMetadata.trialEndDate
      : new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000).toISOString();

    const nextUserMetadata = {
      ...normalized.userMetadata,
      status: "active",
      trialStartDate,
      trialEndDate,
    };

    const { data: updatedUserData, error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        user_metadata: nextUserMetadata,
      });

    if (updateError) {
      throw new Error(updateError.message);
    }

    const verifiedUser = updatedUserData.user || data.user;
    const profile = await resolveProfileForUser(verifiedUser, {
      tenantId: verifiedUser.id,
      role: verifiedUser.app_metadata?.role,
    });

    const sessionUser = buildAppSessionFromSupabaseUser(
      verifiedUser,
      data.session,
      profile,
    );

    const sessionToken = createSessionToken(sessionUser);

    return new Response(null, {
      status: 302,
      headers: {
        Location: origin,
        "Set-Cookie": buildSessionCookie(sessionToken),
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
