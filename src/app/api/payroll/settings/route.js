import { PAYROLL_TABLES } from "@/lib/payroll-constants";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { getPayrollSettingsForTenant } from "@/lib/payroll-settings-service.js";
import { serializePayrollSettings } from "@/lib/payroll-serializer";
import { supabaseAdmin } from "@/lib/supabase-admin";
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

    const data = await getPayrollSettingsForTenant({ tenantDbId, role });

    return json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[api/payroll/settings][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function PUT(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const now = new Date().toISOString();

    const existing = await getPayrollSettingsForTenant({ tenantDbId, role });
    const metadata = { ...(existing.metadata || {}) };
    if ("autoSplitOvertime" in body) {
      metadata.autoSplitOvertime = body.autoSplitOvertime !== false;
    }
    if (body.metadata && typeof body.metadata === "object") {
      Object.assign(metadata, body.metadata);
    }

    const row = {
      tenant_id: tenantDbId,
      employer_legal_name: String(body.employerLegalName || ""),
      default_pay_schedule: String(body.defaultPaySchedule || "biweekly"),
      standard_weekly_hours: Math.min(
        168,
        Math.max(1, Number(body.standardWeeklyHours ?? 40)),
      ),
      pay_week_start_day: Number(body.payWeekStartDay ?? 1),
      default_work_state: String(body.defaultWorkState || "").toUpperCase(),
      futa_rate: Number(body.futaRate ?? existing.futaRate ?? 0.006),
      suta_rate: Number(body.sutaRate ?? existing.sutaRate ?? 0.027),
      metadata,
      updated_at: now,
    };

    const { data, error } = await supabaseAdmin
      .from(PAYROLL_TABLES.SETTINGS)
      .upsert(row, { onConflict: "tenant_id" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return json({ success: true, data: serializePayrollSettings(data) });
  } catch (error) {
    console.error("[api/payroll/settings][PUT]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
