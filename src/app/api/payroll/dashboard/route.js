import { getPayrollDashboardMetrics } from "@/lib/payroll-dashboard";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const metrics = await getPayrollDashboardMetrics(tenantDbId);
    return Response.json({ success: true, data: metrics });
  } catch (error) {
    console.error("[api/payroll/dashboard][GET]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
