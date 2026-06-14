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
  findEmployeeByCreateIdempotencyKey,
} from "@/lib/payroll-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { getPayrollSettingsForTenant } from "@/lib/payroll-settings-service.js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";
import {
  canManageSensitive,
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role  } = context;
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
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role, userId  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const idempotencyKey = String(
      request.headers.get("Idempotency-Key") || body.idempotencyKey || "",
    ).trim();

    if (idempotencyKey) {
      const existing = await findEmployeeByCreateIdempotencyKey({
        tenantDbId,
        role,
        idempotencyKey,
      });
      if (existing) {
        return json({ success: true, data: existing, idempotentReplay: true });
      }
    }

    const settings = await getPayrollSettingsForTenant({ tenantDbId, role });
    const row = buildEmployeeInsertRow(body, tenantDbId, userId);
    if (idempotencyKey) {
      row.create_idempotency_key = idempotencyKey;
    }
    if (!row.work_state && settings.defaultWorkState) {
      row.work_state = String(settings.defaultWorkState).toUpperCase();
    }
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

    if (error) {
      if (
        idempotencyKey &&
        /duplicate key|unique constraint/i.test(error.message || "")
      ) {
        const replay = await findEmployeeByCreateIdempotencyKey({
          tenantDbId,
          role,
          idempotencyKey,
        });
        if (replay) {
          return json({ success: true, data: replay, idempotentReplay: true });
        }
      }
      throw new Error(error.message);
    }

    return json({ success: true, data: serializePayrollEmployee(data) });
  } catch (error) {
    console.error("[api/payroll/employees][POST]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
