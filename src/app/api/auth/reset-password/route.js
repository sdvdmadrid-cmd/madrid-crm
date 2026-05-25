import { createSupabaseServerAuthClient } from "@/lib/supabase-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

function isStrongPassword(value) {
  const password = String(value || "");
  if (password.length < 12) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const defaultDeps = {
  createAuthClient: createSupabaseServerAuthClient,
  supabaseAdmin,
};

export async function handleResetPassword(request, deps = defaultDeps) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    const accessToken = String(body.accessToken || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!token && !accessToken) {
      return jsonResponse(
        { success: false, error: "Reset token is required" },
        400,
      );
    }

    if (!isStrongPassword(newPassword)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Password must be at least 12 chars and include uppercase, lowercase, number, and special character.",
        },
        400,
      );
    }

    const authClient = deps.createAuthClient();
    if (token) {
      const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
        token_hash: token,
        type: "recovery",
      });

      const userId = verifyData?.user?.id || verifyData?.session?.user?.id || "";
      if (verifyError || !userId) {
        return jsonResponse(
          {
            success: false,
            error: "Invalid or expired reset token",
          },
          400,
        );
      }

      const { error: updateError } =
        await deps.supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

      if (updateError) {
        return jsonResponse(
          { success: false, error: updateError.message },
          400,
        );
      }

      return jsonResponse({ success: true });
    }

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user?.id) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid or expired reset session",
        },
        400,
      );
    }

    const { error: adminUpdateError } = await deps.supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
      },
    );

    if (adminUpdateError) {
      return jsonResponse(
        { success: false, error: adminUpdateError.message },
        400,
      );
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function POST(request) {
  return handleResetPassword(request);
}
