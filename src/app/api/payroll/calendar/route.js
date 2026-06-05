import { upcomingPayPeriods, PAYROLL_SCHEDULES } from "@/lib/payroll-calendar.js";
import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const scheduleType = url.searchParams.get("schedule") || "biweekly";
    const count = Math.min(Number(url.searchParams.get("count") || 6), 12);
    const weekStartDay = Number(url.searchParams.get("weekStartDay") || 1);

    const periods = upcomingPayPeriods({
      scheduleType,
      count,
      fromDate: new Date(),
      weekStartDay,
    });

    return Response.json({
      success: true,
      data: { schedules: PAYROLL_SCHEDULES, periods },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
