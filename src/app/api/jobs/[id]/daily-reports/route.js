import {
  createDailyReport,
  listDailyReportsForJob,
} from "@/lib/daily-report-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function GET(request, { params }) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id: jobId } = await params;
    const reports = await listDailyReportsForJob({ tenantDbId, role, jobId });
    return json({ success: true, data: reports });
  } catch (error) {
    console.error("[api/jobs/:id/daily-reports][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function POST(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: jobId } = await params;
    const body = await request.json();
    const report = await createDailyReport({ tenantDbId, role, userId, jobId, body });
    return json({ success: true, data: report }, 201);
  } catch (error) {
    console.error("[api/jobs/:id/daily-reports][POST]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
