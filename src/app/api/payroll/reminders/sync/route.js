import { syncUpcomingRunReminders } from "@/lib/payroll-reminders.js";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { getPayrollSettingsForTenant } from "@/lib/payroll-settings-service.js";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const settings = await getPayrollSettingsForTenant({ tenantDbId, role });
    const scheduleType = String(
      body.schedule || settings.defaultPaySchedule || "biweekly",
    );

    await syncUpcomingRunReminders({
      tenantDbId,
      scheduleType,
      weekStartDay: settings.payWeekStartDay,
    });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
