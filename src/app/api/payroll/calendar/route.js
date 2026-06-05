import { upcomingPayPeriods, PAYROLL_SCHEDULES } from "@/lib/payroll-calendar.js";
import { getPayrollSettingsForTenant } from "@/lib/payroll-settings-service.js";
import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const settings = await getPayrollSettingsForTenant({ tenantDbId, role });
    const url = new URL(request.url);
    const scheduleType =
      url.searchParams.get("schedule") || settings.defaultPaySchedule || "biweekly";
    const count = Math.min(Number(url.searchParams.get("count") || 6), 12);
    const weekStartDay = url.searchParams.has("weekStartDay")
      ? Number(url.searchParams.get("weekStartDay"))
      : Number(settings.payWeekStartDay ?? 1);

    const periods = upcomingPayPeriods({
      scheduleType,
      count,
      fromDate: new Date(),
      weekStartDay,
    });

    return Response.json({
      success: true,
      data: {
        schedules: PAYROLL_SCHEDULES,
        periods,
        settings: {
          defaultPaySchedule: settings.defaultPaySchedule,
          standardWeeklyHours: settings.standardWeeklyHours,
          payWeekStartDay: settings.payWeekStartDay,
        },
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
