import { buildPayrollReport } from "@/lib/payroll-reports";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const reportType = url.searchParams.get("type") || "date_range";
    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;
    const employeeId = url.searchParams.get("employeeId") || undefined;
    const groupBy = url.searchParams.get("groupBy") || "none";

    const report = await buildPayrollReport({
      tenantDbId,
      reportType,
      startDate,
      endDate,
      employeeId,
      groupBy,
    });

    return Response.json({ success: true, data: report });
  } catch (error) {
    console.error("[api/payroll/reports][GET]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
