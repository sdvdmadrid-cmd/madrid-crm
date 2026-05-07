import { verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const session = verifySessionToken(sessionToken);
    if (!session?.userId) {
      return Response.json(
        { success: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    // Verify super admin role
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(session.userId);
    const userRole = String(userData?.user?.app_metadata?.role || "").toLowerCase();

    if (userRole !== "super_admin") {
      return Response.json(
        { success: false, error: "Forbidden — super admin only" },
        { status: 403 }
      );
    }

    // Gather system settings
    const settings = {
      emailProvider: process.env.EMAIL_PROVIDER || "resend",
      emailFrom: process.env.EMAIL_FROM || "noreply@fieldbaseapp.net",
      stripeApiKey: process.env.STRIPE_SECRET_KEY ? "***configured***" : "⚠ missing",
      sessionSecretStatus: process.env.SESSION_SECRET ? "✓ Configured" : "⚠ Missing",
      lastHealthCheck: new Date().toISOString(),
    };

    return Response.json({
      success: true,
      data: settings,
    });
  } catch (err) {
    console.error("[admin/system-settings] GET failed", err);
    return Response.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const session = verifySessionToken(sessionToken);
    if (!session?.userId) {
      return Response.json(
        { success: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    // Verify super admin role
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(session.userId);
    const userRole = String(userData?.user?.app_metadata?.role || "").toLowerCase();

    if (userRole !== "super_admin") {
      return Response.json(
        { success: false, error: "Forbidden — super admin only" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return Response.json(
        { success: false, error: "Missing 'key' parameter" },
        { status: 400 }
      );
    }

    // For now, just return success with current settings
    // In a real system, you'd update environment variables or database
    const settings = {
      emailProvider: process.env.EMAIL_PROVIDER || "resend",
      emailFrom: process.env.EMAIL_FROM || "noreply@fieldbaseapp.net",
      stripeApiKey: process.env.STRIPE_SECRET_KEY ? "***configured***" : "⚠ missing",
      sessionSecretStatus: process.env.SESSION_SECRET ? "✓ Configured" : "⚠ Missing",
      lastHealthCheck: new Date().toISOString(),
    };

    return Response.json({
      success: true,
      data: settings,
    });
  } catch (err) {
    console.error("[admin/system-settings] POST failed", err);
    return Response.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
