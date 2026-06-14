import { PAYROLL_TABLES } from "@/lib/payroll-constants";
import {
  canUsePayrollEncryption,
  encryptDirectDeposit,
  encryptSsn,
} from "@/lib/payroll-pii";
import {
  buildEmployeeInsertRow,
  serializePayrollEmployee,
} from "@/lib/payroll-serializer";
import {
  deletePayrollEmployeePermanently,
  listEmployeePayrollHistory,
} from "@/lib/payroll-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";
import {
  canDelete,
  canManageSensitive,
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

    const { id } = await params;
    const url = new URL(request.url);
    const includeHistory = url.searchParams.get("history") === "1";

    const { data, error } = await scopeByTenant(
      supabaseAdmin
        .from(PAYROLL_TABLES.EMPLOYEES)
        .select("*")
        .eq("id", id)
        .maybeSingle(),
      { tenantDbId, role },
    );

    if (error) throw new Error(error.message);
    if (!data) return json({ success: false, error: "Employee not found" }, 404);

    const payload = serializePayrollEmployee(data);
    if (includeHistory) {
      payload.payrollHistory = await listEmployeePayrollHistory({
        tenantDbId,
        role,
        employeeId: id,
      });
    }

    return json({ success: true, data: payload });
  } catch (error) {
    console.error("[api/payroll/employees/:id][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function PATCH(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json();
    const row = buildEmployeeInsertRow(body, tenantDbId, userId);
    delete row.created_by;
    delete row.tenant_id;
    delete row.user_id;

    if (body.ssn && canManageSensitive(role)) {
      if (!canUsePayrollEncryption()) {
        return json(
          { success: false, error: "ENCRYPTION_KEY is not configured." },
          503,
        );
      }
      const ssn = encryptSsn(body.ssn);
      row.ssn_encrypted = ssn.encrypted;
      row.ssn_last4 = ssn.last4;
    }

    if (body.directDeposit && canManageSensitive(role)) {
      if (!canUsePayrollEncryption()) {
        return json(
          { success: false, error: "ENCRYPTION_KEY is not configured." },
          503,
        );
      }
      const dd = encryptDirectDeposit(body.directDeposit);
      row.direct_deposit_encrypted = dd.encrypted;
      row.direct_deposit_last4 = dd.last4;
    }

    const { data, error } = await scopeByTenant(
      supabaseAdmin
        .from(PAYROLL_TABLES.EMPLOYEES)
        .update(row)
        .eq("id", id)
        .select("*")
        .maybeSingle(),
      { tenantDbId, role },
    );

    if (error) throw new Error(error.message);
    if (!data) return json({ success: false, error: "Employee not found" }, 404);

    return json({ success: true, data: serializePayrollEmployee(data) });
  } catch (error) {
    console.error("[api/payroll/employees/:id][PATCH]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function DELETE(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canDelete(role)) return forbiddenResponse();

    const { id } = await params;
    const result = await deletePayrollEmployeePermanently({
      tenantDbId,
      role,
      employeeId: id,
    });

    return json({ success: true, data: result });
  } catch (error) {
    console.error("[api/payroll/employees/:id][DELETE]", error);
    const status = Number(error?.statusCode) || 500;
    return json(
      { success: false, error: error?.message || "Unable to delete employee" },
      status,
    );
  }
}
