import {
  dismissPayrollReminder,
  listPayrollReminders,
  syncUpcomingRunReminders,
} from "@/lib/payroll-reminders.js";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { getPayrollSettingsForTenant } from "@/lib/payroll-settings-service.js";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const settings = await getPayrollSettingsForTenant({ tenantDbId, role });
    const url = new URL(request.url);
    const sync = url.searchParams.get("sync") === "1";
    const scheduleType =
      url.searchParams.get("schedule") || settings.defaultPaySchedule || "biweekly";

    if (sync) {
      await syncUpcomingRunReminders({
        tenantDbId,
        scheduleType,
        weekStartDay: settings.payWeekStartDay,
      });
    }

    const reminders = await listPayrollReminders({ tenantDbId });
    return Response.json({ success: true, data: reminders });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    if (body.action === "dismiss" && body.reminderId) {
      const reminder = await dismissPayrollReminder({
        tenantDbId,
        reminderId: body.reminderId,
      });
      return Response.json({ success: true, data: reminder });
    }

    return Response.json({ success: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
