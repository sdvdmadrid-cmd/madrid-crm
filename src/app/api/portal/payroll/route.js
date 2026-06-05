import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PAYROLL_TABLES } from "@/lib/payroll-constants.js";
import { serializePayrollEmployee } from "@/lib/payroll-serializer.js";
import { listEmployeePayrollHistory } from "@/lib/payroll-service.js";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { buildEmployeeInsertRow } from "@/lib/payroll-serializer.js";
import { encryptDirectDeposit } from "@/lib/payroll-pii.js";

export const dynamic = "force-dynamic";

async function getLinkedEmployee(tenantDbId, userId) {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.EMPLOYEES)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const employee = await getLinkedEmployee(tenantDbId, userId);
    if (!employee) {
      return Response.json(
        { success: false, error: "No employee profile linked to your account." },
        { status: 404 },
      );
    }

    const history = await listEmployeePayrollHistory({
      tenantDbId,
      role: "viewer",
      employeeId: employee.id,
    });

    return Response.json({
      success: true,
      data: {
        profile: serializePayrollEmployee(employee),
        payStubs: history,
        ptoBalanceHours: Number(employee.pto_balance_hours || 0),
        sickBalanceHours: Number(employee.sick_balance_hours || 0),
      },
    });
  } catch (error) {
    console.error("[api/portal/payroll][GET]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const employee = await getLinkedEmployee(tenantDbId, userId);
    if (!employee) {
      return Response.json({ success: false, error: "Employee profile not found." }, { status: 404 });
    }

    const body = await request.json();
    const row = buildEmployeeInsertRow(body, tenantDbId, userId);
    delete row.tenant_id;
    delete row.created_by;
    delete row.tax_form;
    delete row.pay_type;
    delete row.hourly_rate;
    delete row.annual_salary;
    delete row.federal_exempt;
    delete row.state_exempt;

    if (body.directDeposit) {
      const dd = encryptDirectDeposit(body.directDeposit);
      row.direct_deposit_encrypted = dd.encrypted;
      row.direct_deposit_last4 = dd.last4;
    }

    const { data, error } = await supabaseAdmin
      .from(PAYROLL_TABLES.EMPLOYEES)
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", employee.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return Response.json({ success: true, data: serializePayrollEmployee(data) });
  } catch (error) {
    console.error("[api/portal/payroll][PATCH]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
