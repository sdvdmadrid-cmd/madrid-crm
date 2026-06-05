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
import { listEmployeePayrollHistory } from "@/lib/payroll-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";
import {
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

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "active";
    const limit = Math.min(Number(url.searchParams.get("limit") || 500), 500);
    const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

    let query = supabaseAdmin
      .from(PAYROLL_TABLES.EMPLOYEES)
      .select("*", { count: "exact" })
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error, count } = await scopeByTenant(query, { tenantDbId, role });
    if (error) throw new Error(error.message);

    return json({
      success: true,
      data: (data || []).map(serializePayrollEmployee),
      pagination: { total: count || 0, limit, offset },
    });
  } catch (error) {
    console.error("[api/payroll/employees][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function POST(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const row = buildEmployeeInsertRow(body, tenantDbId, userId);
    row.created_at = new Date().toISOString();

    if (body.ssn && canManageSensitive(role)) {
      if (!canUsePayrollEncryption()) {
        return json(
          {
            success: false,
            error:
              "ENCRYPTION_KEY is not configured. SSN cannot be stored securely.",
          },
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
          {
            success: false,
            error:
              "ENCRYPTION_KEY is not configured. Direct deposit cannot be stored securely.",
          },
          503,
        );
      }
      const dd = encryptDirectDeposit(body.directDeposit);
      row.direct_deposit_encrypted = dd.encrypted;
      row.direct_deposit_last4 = dd.last4;
    }

    const { data, error } = await supabaseAdmin
      .from(PAYROLL_TABLES.EMPLOYEES)
      .insert(row)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return json({ success: true, data: serializePayrollEmployee(data) });
  } catch (error) {
    console.error("[api/payroll/employees][POST]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
