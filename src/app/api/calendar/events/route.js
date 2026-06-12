import { isValidYmd } from "@/lib/local-date";
import { getCalendarEventsForRange } from "@/lib/calendar-events-server";
import {
  canRead,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canRead(role)) return forbiddenResponse();

    const { searchParams } = new URL(request.url);
    const from = String(searchParams.get("from") || "").trim();
    const to = String(searchParams.get("to") || "").trim();

    if (!isValidYmd(from) || !isValidYmd(to)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "from and to must be YYYY-MM-DD",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const payload = await getCalendarEventsForRange({
      tenantDbId,
      role,
      from,
      to,
    });

    return new Response(JSON.stringify({ success: true, data: payload }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/calendar/events][GET] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unable to load calendar events",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
