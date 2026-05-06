import { getAuthenticatedTenantContext } from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRequestOrigin, generatePasswordRecoveryLink } from "@/lib/supabase-auth";

function deriveStatus(userMetadata) {
  if (userMetadata?.isSubscribed === true) return "Active";

  const trialEndMs = userMetadata?.trialEndDate
    ? new Date(userMetadata.trialEndDate).getTime()
    : 0;
  if (Number.isFinite(trialEndMs) && trialEndMs > Date.now()) return "Trial";

  const raw = String(userMetadata?.status || "").toLowerCase();
  if (raw === "pending_verification") return "Pending";

  return "Expired";
}

export async function POST(request, { params }) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated || role !== "super_admin") {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const targetUserId = String(params?.id || "").trim();
    if (!targetUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing user id" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    const { data: userData, error: getUserError } =
      await supabaseAdmin.auth.admin.getUserById(targetUserId);
    if (getUserError || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const currentUser = userData.user;
    const currentMeta = { ...(currentUser.user_metadata || {}) };

    if (action === "extend_trial") {
      const parsedDays = Number(body?.days);
      const normalizedDays = Number.isFinite(parsedDays) ? Math.trunc(parsedDays) : 30;
      const days = Math.max(1, Math.min(365, normalizedDays));
      const now = Date.now();
      const currentTrialMs = currentMeta?.trialEndDate
        ? new Date(currentMeta.trialEndDate).getTime()
        : 0;
      const baseMs = Number.isFinite(currentTrialMs) && currentTrialMs > now
        ? currentTrialMs
        : now;
      const nextTrialDate = new Date(baseMs + days * 24 * 60 * 60 * 1000);
      if (!Number.isFinite(nextTrialDate.getTime())) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid trial extension days" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const nextTrial = nextTrialDate.toISOString();

      const nextMeta = {
        ...currentMeta,
        isSubscribed: false,
        status: "trial",
        trialEndDate: nextTrial,
      };

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { user_metadata: nextMeta },
      );
      if (updateError) {
        throw new Error(updateError.message || "Unable to extend trial");
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            userId: targetUserId,
            status: deriveStatus(nextMeta),
            trialEndDate: nextTrial,
            isSubscribed: false,
            message: `Trial extended by ${days} day(s).`,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (action === "set_subscription") {
      const subscribed = body?.subscribed === true;
      const now = Date.now();
      const trialEndMs = currentMeta?.trialEndDate
        ? new Date(currentMeta.trialEndDate).getTime()
        : 0;

      const nextMeta = {
        ...currentMeta,
        isSubscribed: subscribed,
        status: subscribed
          ? "active"
          : Number.isFinite(trialEndMs) && trialEndMs > now
            ? "trial"
            : "expired",
      };

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { user_metadata: nextMeta },
      );
      if (updateError) {
        throw new Error(updateError.message || "Unable to update subscription");
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            userId: targetUserId,
            status: deriveStatus(nextMeta),
            trialEndDate: nextMeta?.trialEndDate || null,
            isSubscribed: subscribed,
            message: subscribed
              ? "Subscription marked as active."
              : "Subscription removed.",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (action === "password_reset_link") {
      const email = String(currentUser.email || "").trim().toLowerCase();
      if (!email) {
        return new Response(
          JSON.stringify({ success: false, error: "User email not available" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const origin = getRequestOrigin(request) || process.env.APP_URL || "http://localhost:3000";
      const link = await generatePasswordRecoveryLink({ email, origin });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            userId: targetUserId,
            email,
            resetUrl: link.resetUrl,
            message: "Password reset link generated.",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Unsupported action" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
