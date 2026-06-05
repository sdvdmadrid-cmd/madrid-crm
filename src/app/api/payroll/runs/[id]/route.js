import { PAYROLL_TABLES, MUTABLE_RUN_STATUSES } from "@/lib/payroll-constants";
import {
  serializePayrollRun,
  serializePayrollRunItem,
} from "@/lib/payroll-serializer";
import { assertRunMutable } from "@/lib/payroll-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
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

async function loadRunWithItems(id, tenantDbId, role) {
  const { data: run, error } = await scopeByTenant(
    supabaseAdmin.from(PAYROLL_TABLES.RUNS).select("*").eq("id", id).maybeSingle(),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  if (!run) return null;

  const { data: items, error: itemsError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("*, payroll_employees(*)")
    .eq("tenant_id", tenantDbId)
    .eq("run_id", id)
    .order("created_at", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  return {
    run: serializePayrollRun(run),
    items: (items || []).map((row) =>
      serializePayrollRunItem(row, row.payroll_employees),
    ),
  };
}

export async function GET(request, { params }) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    const payload = await loadRunWithItems(id, tenantDbId, role);
    if (!payload) return json({ success: false, error: "Pay run not found" }, 404);

    return json({ success: true, data: payload });
  } catch (error) {
    console.error("[api/payroll/runs/:id][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function PATCH(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json();

    const { data: existing, error: existingError } = await scopeByTenant(
      supabaseAdmin.from(PAYROLL_TABLES.RUNS).select("*").eq("id", id).maybeSingle(),
      { tenantDbId, role },
    );
    if (existingError) throw new Error(existingError.message);
    if (!existing) return json({ success: false, error: "Pay run not found" }, 404);

    assertRunMutable(existing.status);

    const updateRow = { updated_at: new Date().toISOString() };
    if ("title" in body) updateRow.title = String(body.title || "");
    if ("notes" in body) updateRow.notes = String(body.notes || "");
    if ("scheduleType" in body) updateRow.schedule_type = String(body.scheduleType || existing.schedule_type);
    if ("periodStart" in body) updateRow.period_start = body.periodStart;
    if ("periodEnd" in body) updateRow.period_end = body.periodEnd;
    if ("payDate" in body) updateRow.pay_date = body.payDate;

    const { data, error } = await supabaseAdmin
      .from(PAYROLL_TABLES.RUNS)
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        if (!item.employeeId) continue;
        const itemRow = {
          tenant_id: tenantDbId,
          run_id: id,
          employee_id: item.employeeId,
          hours_regular: Number(item.hoursRegular || 0),
          hours_overtime: Number(item.hoursOvertime || 0),
          pto_hours: Number(item.ptoHours || 0),
          sick_hours: Number(item.sickHours || 0),
          hourly_rate: Number(item.hourlyRate || 0),
          job_id: item.jobId || null,
          notes: String(item.notes || ""),
          updated_at: new Date().toISOString(),
        };

        if (item.id) {
          await supabaseAdmin
            .from(PAYROLL_TABLES.RUN_ITEMS)
            .update(itemRow)
            .eq("id", item.id)
            .eq("run_id", id);
        } else {
          itemRow.created_at = itemRow.updated_at;
          await supabaseAdmin.from(PAYROLL_TABLES.RUN_ITEMS).upsert(itemRow, {
            onConflict: "run_id,employee_id",
          });
        }
      }
    }

    const payload = await loadRunWithItems(id, tenantDbId, role);
    return json({ success: true, data: payload });
  } catch (error) {
    console.error("[api/payroll/runs/:id][PATCH]", error);
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
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    const { data: existing } = await scopeByTenant(
      supabaseAdmin.from(PAYROLL_TABLES.RUNS).select("status").eq("id", id).maybeSingle(),
      { tenantDbId, role },
    );
    if (!existing) return json({ success: false, error: "Pay run not found" }, 404);
    if (!MUTABLE_RUN_STATUSES.has(existing.status)) {
      return json({ success: false, error: "Approved pay runs cannot be deleted." }, 409);
    }

    const { error } = await supabaseAdmin.from(PAYROLL_TABLES.RUNS).delete().eq("id", id);
    if (error) throw new Error(error.message);

    return json({ success: true });
  } catch (error) {
    console.error("[api/payroll/runs/:id][DELETE]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
