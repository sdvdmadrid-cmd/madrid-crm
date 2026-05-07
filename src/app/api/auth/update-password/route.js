import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request) {
  try {
    const body = await request.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return Response.json(
        { success: false, error: "Missing token or password" },
        { status: 400 }
      );
    }

    // Verify token is valid (from recovery email)
    const { data, error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
      token,
      { password: newPassword }
    );

    if (resetError) {
      return Response.json(
        { success: false, error: resetError.message },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("[auth/update-password]", err);
    return Response.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
