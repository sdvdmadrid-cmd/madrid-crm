import { getPayrollPlSummary } from "@/lib/payroll-accounting.js";
import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    const jobId = url.searchParams.get("jobId") || undefined;

    const summary = await getPayrollPlSummary({ tenantDbId, startDate, endDate, jobId });
    return Response.json({ success: true, data: summary });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
