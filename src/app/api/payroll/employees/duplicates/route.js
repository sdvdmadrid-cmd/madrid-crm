import { findDuplicateEmployeeGroups } from "@/lib/payroll-employee-duplicates";
import { deletePayrollEmployeePermanently } from "@/lib/payroll-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canDelete,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canDelete(role)) return forbiddenResponse();

    const groups = await findDuplicateEmployeeGroups({ tenantDbId, role });
    const duplicateEmployeeCount = groups.reduce(
      (sum, group) => sum + group.employees.length,
      0,
    );

    return json({
      success: true,
      data: {
        groups,
        groupCount: groups.length,
        duplicateEmployeeCount,
      },
    });
  } catch (error) {
    console.error("[api/payroll/employees/duplicates][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function POST(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canDelete(role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const employeeIds = Array.isArray(body.employeeIds)
      ? body.employeeIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!employeeIds.length) {
      return json({ success: false, error: "employeeIds is required" }, 400);
    }

    const deleted = [];
    const failed = [];

    for (const employeeId of employeeIds) {
      try {
        await deletePayrollEmployeePermanently({
          tenantDbId,
          role,
          employeeId,
        });
        deleted.push(employeeId);
      } catch (error) {
        failed.push({
          employeeId,
          error: error?.message || "Unable to delete employee",
          statusCode: Number(error?.statusCode) || 500,
        });
      }
    }

    return json({
      success: failed.length === 0,
      data: { deleted, failed },
    });
  } catch (error) {
    console.error("[api/payroll/employees/duplicates][POST]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
