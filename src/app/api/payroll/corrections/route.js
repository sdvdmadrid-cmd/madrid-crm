import { voidPayrollRun, createCorrectionRun } from "@/lib/payroll-corrections.js";
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
    const action = String(body.action || "").toLowerCase();

    if (action === "void") {
      const run = await voidPayrollRun({
        tenantDbId,
        role,
        runId: body.runId,
        userId,
        reason: body.reason || "",
      });
      return Response.json({ success: true, data: run });
    }

    if (action === "correction") {
      const run = await createCorrectionRun({
        tenantDbId,
        role,
        userId,
        originalRunId: body.originalRunId,
        title: body.title,
        notes: body.notes || "",
        adjustments: body.adjustments || [],
      });
      return Response.json({ success: true, data: run });
    }

    return Response.json({ success: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("[api/payroll/corrections][POST]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
