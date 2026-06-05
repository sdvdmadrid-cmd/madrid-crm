import { PAYROLL_TABLES } from "@/lib/payroll-constants";
import {
  serializePayrollRun,
  serializePayrollRunItem,
} from "@/lib/payroll-serializer";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  getPayrollSettingsForTenant,
  suggestedPayRunFromSettings,
} from "@/lib/payroll-settings-service.js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";
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

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { data, error } = await scopeByTenant(
      supabaseAdmin
        .from(PAYROLL_TABLES.RUNS)
        .select("*")
        .order("period_end", { ascending: false })
        .order("created_at", { ascending: false }),
      { tenantDbId, role },
    );

    if (error) throw new Error(error.message);

    return json({
      success: true,
      data: (data || []).map(serializePayrollRun),
    });
  } catch (error) {
    console.error("[api/payroll/runs][GET]", error);
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
    const now = new Date().toISOString();
    const settings = await getPayrollSettingsForTenant({ tenantDbId, role });
    const suggested = body.useTenantDefaults
      ? suggestedPayRunFromSettings(settings)
      : null;

    const row = {
      tenant_id: tenantDbId,
      user_id: userId || null,
      schedule_type: String(
        body.scheduleType || suggested?.scheduleType || settings.defaultPaySchedule || "biweekly",
      ),
      period_start: body.periodStart || suggested?.periodStart,
      period_end: body.periodEnd || suggested?.periodEnd,
      pay_date: body.payDate || suggested?.payDate,
      title:
        String(body.title || "").trim() ||
        suggested?.title ||
        `Payroll ${body.periodEnd || suggested?.periodEnd || ""}`,
      notes: String(body.notes || ""),
      status: "draft",
      created_by: userId || null,
      created_at: now,
      updated_at: now,
    };

    if (!row.period_start || !row.period_end || !row.pay_date) {
      return json(
        { success: false, error: "periodStart, periodEnd, and payDate are required" },
        400,
      );
    }

    const { data, error } = await supabaseAdmin
      .from(PAYROLL_TABLES.RUNS)
      .insert(row)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length) {
      const insertRows = items.map((item) => ({
        tenant_id: tenantDbId,
        run_id: data.id,
        employee_id: item.employeeId,
        hours_regular: Number(item.hoursRegular || 0),
        hours_overtime: Number(item.hoursOvertime || 0),
        hourly_rate: Number(item.hourlyRate || 0),
        notes: String(item.notes || ""),
        created_at: now,
        updated_at: now,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from(PAYROLL_TABLES.RUN_ITEMS)
        .insert(insertRows);

      if (itemsError) throw new Error(itemsError.message);
    }

    return json({ success: true, data: serializePayrollRun(data) });
  } catch (error) {
    console.error("[api/payroll/runs][POST]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
