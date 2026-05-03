import { clearSessionCookie } from "@/lib/auth";
import { invalidateCachedSession } from "@/lib/session-cache";

export async function POST(request) {
  try {
    // Invalidate Redis session cache so token is rejected immediately
    const cookie =
      request.cookies.get("__Host-madrid_session")?.value ||
      request.cookies.get("madrid_session")?.value;
    if (cookie) {
      await invalidateCachedSession(cookie);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": clearSessionCookie(),
      },
    });
  } catch (error) {
    console.error("[api/auth/logout] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unable to log out",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
