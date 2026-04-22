import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  try {
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
