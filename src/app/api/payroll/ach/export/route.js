import { buildAchExportForRun } from "@/lib/payroll-job-costing";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
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
    const { authenticated, tenantDbId, role, userId  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const runId = String(body.runId || "").trim();
    if (!runId) {
      return Response.json({ success: false, error: "runId is required." }, { status: 400 });
    }

    const result = await buildAchExportForRun({ tenantDbId, runId, userId });
    return Response.json({
      success: true,
      data: {
        batchId: result.batch?.id,
        fileName: result.fileName,
        fileContent: result.fileContent,
        totalAmount: result.totalAmount,
        entryCount: result.entryCount,
      },
    });
  } catch (error) {
    console.error("[api/payroll/ach/export][POST]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
