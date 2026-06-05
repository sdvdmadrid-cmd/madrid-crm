import { PAYROLL_TABLES } from "@/lib/payroll-constants";
import { serializePayrollSettings } from "@/lib/payroll-serializer";
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
        .from(PAYROLL_TABLES.SETTINGS)
        .select("*")
        .eq("tenant_id", tenantDbId)
        .maybeSingle(),
      { tenantDbId, role },
    );

    if (error) throw new Error(error.message);

    return json({
      success: true,
      data: data ? serializePayrollSettings(data) : serializePayrollSettings({ tenant_id: tenantDbId }),
    });
  } catch (error) {
    console.error("[api/payroll/settings][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function PUT(request) {
  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const now = new Date().toISOString();
    const row = {
      tenant_id: tenantDbId,
      employer_legal_name: String(body.employerLegalName || ""),
      default_pay_schedule: String(body.defaultPaySchedule || "biweekly"),
      pay_week_start_day: Number(body.payWeekStartDay ?? 1),
      default_work_state: String(body.defaultWorkState || "").toUpperCase(),
      futa_rate: Number(body.futaRate ?? 0.006),
      suta_rate: Number(body.sutaRate ?? 0.027),
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
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
