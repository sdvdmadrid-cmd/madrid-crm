import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { supabaseAdmin } from "./supabase-admin.js";

export async function logPayrollAudit({
  tenantDbId,
  actorId,
  entityType,
  entityId,
  action,
  beforeSnapshot = {},
  afterSnapshot = {},
  notes = "",
}) {
  await supabaseAdmin.from("payroll_audit_log").insert({
    tenant_id: tenantDbId,
    actor_id: actorId || null,
    entity_type: entityType,
    entity_id: entityId,
    action,
    before_snapshot: beforeSnapshot,
    after_snapshot: afterSnapshot,
    notes,
    created_at: new Date().toISOString(),
  });
}

export async function voidPayrollRun({
  tenantDbId,
  role,
  runId,
  userId,
  reason = "",
}) {
  const { data: run, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("id", runId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!run) throw new Error("Pay run not found");
  if (run.status === "void") throw new Error("Pay run is already void.");
  if (!["approved", "finalized"].includes(run.status)) {
    throw new Error("Only approved or finalized runs can be voided.");
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .update({
      status: "void",
      voided_at: now,
      voided_by: userId || null,
      void_reason: String(reason || "").trim(),
      updated_at: now,
    })
    .eq("id", runId)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "payroll_run",
    entityId: runId,
    action: "void",
    beforeSnapshot: run,
    afterSnapshot: updated,
    notes: reason,
  });

  return updated;
}

export async function createCorrectionRun({
  tenantDbId,
  role,
  userId,
  originalRunId,
  title,
  notes = "",
  adjustments = [],
}) {
  const { data: original, error: origError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("id", originalRunId)
    .maybeSingle();

  if (origError) throw new Error(origError.message);
  if (!original) throw new Error("Original pay run not found.");
  if (!["approved", "finalized", "void"].includes(original.status)) {
    throw new Error("Original run must be approved, finalized, or void.");
  }

  const { data: originalItems, error: itemsError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("*, payroll_employees(*)")
    .eq("run_id", originalRunId);

  if (itemsError) throw new Error(itemsError.message);

  const now = new Date().toISOString();
  const { data: correctionRun, error: runError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .insert({
      tenant_id: tenantDbId,
      user_id: userId || null,
      schedule_type: original.schedule_type,
      period_start: original.period_start,
      period_end: original.period_end,
      pay_date: original.pay_date,
      status: "draft",
      title: title || `Correction — ${original.title}`,
      notes,
      run_type: "correction",
      correction_of_run_id: originalRunId,
      created_by: userId || null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (runError) throw new Error(runError.message);

  const adjustmentMap = new Map(
    (adjustments || []).map((row) => [row.employeeId || row.employee_id, row]),
  );

  for (const item of originalItems || []) {
    const adj = adjustmentMap.get(item.employee_id) || {};
    const multiplier = Number(adj.multiplier ?? -1);

    await supabaseAdmin.from(PAYROLL_TABLES.RUN_ITEMS).insert({
      tenant_id: tenantDbId,
      run_id: correctionRun.id,
      employee_id: item.employee_id,
      hours_regular: roundHours(Number(item.hours_regular || 0) * multiplier, adj.hoursRegular),
      hours_overtime: roundHours(Number(item.hours_overtime || 0) * multiplier, adj.hoursOvertime),
      hourly_rate: Number(item.hourly_rate || 0),
      job_id: item.job_id || null,
      correction_of_item_id: item.id,
      notes: adj.notes || "Correction entry",
      created_at: now,
      updated_at: now,
    });
  }

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "payroll_run",
    entityId: correctionRun.id,
    action: "create_correction",
    afterSnapshot: { correctionRun, originalRunId },
    notes,
  });

  return correctionRun;
}

function roundHours(defaultVal, override) {
  if (override != null && override !== "") return Number(override);
  return defaultVal;
}
