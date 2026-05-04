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

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    const accessToken = String(body.accessToken || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!token && !accessToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Reset token is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!isStrongPassword(newPassword)) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Password must be at least 12 chars and include uppercase, lowercase, number, and special character.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const authClient = createSupabaseServerAuthClient();
    if (token) {
      const { error: verifyError } = await authClient.auth.verifyOtp({
        token_hash: token,
        type: "recovery",
      });

      if (verifyError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid or expired reset token",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const { error: updateError } = await authClient.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user?.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid or expired reset session",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { error: adminUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
      },
    );

    if (adminUpdateError) {
      return new Response(
        JSON.stringify({ success: false, error: adminUpdateError.message }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
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
