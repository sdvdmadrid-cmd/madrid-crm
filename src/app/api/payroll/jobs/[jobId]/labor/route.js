import { getJobLaborSummary } from "@/lib/payroll-job-costing";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { jobId } = await params;
    const summary = await getJobLaborSummary(tenantDbId, jobId);
    return Response.json({ success: true, data: summary });
  } catch (error) {
    console.error("[api/payroll/jobs/:jobId/labor][GET]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
