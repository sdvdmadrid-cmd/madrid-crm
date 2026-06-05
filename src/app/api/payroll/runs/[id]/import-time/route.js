import { importTimeEntriesForRun } from "@/lib/payroll-time-service";
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
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    const result = await importTimeEntriesForRun({
      tenantDbId,
      role,
      runId: id,
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    console.error("[api/payroll/runs/:id/import-time][POST]", error);
    return Response.json({ success: false, error: error.message }, 500);
  }
}
