import {
  approvePayrollRun,
  finalizePayrollRun,
} from "@/lib/payroll-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "approve");

    const run =
      action === "finalize"
        ? await finalizePayrollRun({ tenantDbId, role, runId: id, userId })
        : await approvePayrollRun({ tenantDbId, role, runId: id, userId });

    return Response.json({ success: true, data: run });
  } catch (error) {
    console.error("[api/payroll/runs/:id/approve][POST]", error);
    return Response.json({ success: false, error: error.message }, 500);
  }
}
