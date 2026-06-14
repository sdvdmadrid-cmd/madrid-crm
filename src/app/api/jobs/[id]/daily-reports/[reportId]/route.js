import {
  deleteDailyReport,
  updateDailyReport,
} from "@/lib/daily-report-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function PATCH(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: jobId, reportId } = await params;
    const body = await request.json();
    const report = await updateDailyReport({
      tenantDbId,
      role,
      jobId,
      reportId,
      body,
    });
    return json({ success: true, data: report });
  } catch (error) {
    console.error("[api/jobs/:id/daily-reports/:reportId][PATCH]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function DELETE(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: jobId, reportId } = await params;
    await deleteDailyReport({ tenantDbId, role, jobId, reportId });
    return json({ success: true });
  } catch (error) {
    console.error("[api/jobs/:id/daily-reports/:reportId][DELETE]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
