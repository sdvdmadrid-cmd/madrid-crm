import "server-only";

import { buildAchFileContent } from "./payroll-ach-export.js";
import { PAYROLL_TABLES } from "./payroll-constants.js";
import { logPayrollAudit } from "./payroll-corrections.js";
import { roundMoney } from "./payroll-money.js";
import { decryptDirectDepositIfNeeded } from "./payroll-pii.js";
import { supabaseAdmin } from "./supabase-admin.js";

async function loadAchEntriesForRun({ tenantDbId, runId }) {
  const { data: run, error: runError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("id", runId)
    .maybeSingle();

  if (runError) throw new Error(runError.message);
  if (!run) throw new Error("Pay run not found");
  if (!["approved", "finalized"].includes(run.status)) {
    throw new Error("Approve the pay run before creating an ACH batch.");
  }

  const [{ data: settings }, { data: items, error: itemsError }] = await Promise.all([
    supabaseAdmin
      .from(PAYROLL_TABLES.SETTINGS)
      .select("*")
      .eq("tenant_id", tenantDbId)
      .maybeSingle(),
    supabaseAdmin
      .from(PAYROLL_TABLES.RUN_ITEMS)
      .select("*, payroll_employees(*)")
      .eq("tenant_id", tenantDbId)
      .eq("run_id", runId),
  ]);

  if (itemsError) throw new Error(itemsError.message);

  const achEntries = [];
  for (const item of items || []) {
    const employee = item.payroll_employees;
    if (!employee?.direct_deposit_encrypted) continue;
    const dd = decryptDirectDepositIfNeeded(employee.direct_deposit_encrypted);
    if (!dd?.routingNumber || !dd?.accountNumber) continue;
    achEntries.push({
      name: `${employee.first_name} ${employee.last_name}`.trim(),
      routingNumber: dd.routingNumber,
      accountNumber: dd.accountNumber,
      amount: Number(item.net_pay || 0),
    });
  }

  if (!achEntries.length) {
    throw new Error("No employees with direct deposit on this pay run.");
  }

  const fileContent = buildAchFileContent({
    companyName: settings?.employer_legal_name || "FieldBase Contractor",
    companyId: settings?.tenant_id || tenantDbId,
    effectiveDate: run.pay_date,
    entries: achEntries,
  });

  const totalAmount = roundMoney(
    achEntries.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
  const fileName = `ach_payroll_${String(run.pay_date).replace(/-/g, "")}_${runId.slice(0, 8)}.txt`;

  return { run, fileContent, fileName, totalAmount, entryCount: achEntries.length };
}

function serializeBatch(row = {}) {
  return {
    id: row.id,
    runId: row.run_id,
    status: row.status,
    fileName: row.file_name,
    totalAmount: Number(row.total_amount || 0),
    entryCount: Number(row.entry_count || 0),
    submittedBy: row.submitted_by || null,
    submittedAt: row.submitted_at || null,
    approvedBy: row.approved_by || null,
    approvedAt: row.approved_at || null,
    rejectedReason: row.rejected_reason || "",
    exportedBy: row.exported_by || null,
    exportedAt: row.exported_at || null,
    createdAt: row.created_at || null,
  };
}

export async function listAchBatchesForRun({ tenantDbId, runId }) {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.ACH_BATCHES)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("run_id", runId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(serializeBatch);
}

export async function createAchBatchDraft({ tenantDbId, runId, userId }) {
  const existing = await listAchBatchesForRun({ tenantDbId, runId });
  const active = existing.find((b) => !["void", "transmitted"].includes(b.status));
  if (active) return { batch: active, fileContent: null, created: false };

  const { run, fileContent, fileName, totalAmount, entryCount } =
    await loadAchEntriesForRun({ tenantDbId, runId });

  const now = new Date().toISOString();
  const { data: batch, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.ACH_BATCHES)
    .insert({
      tenant_id: tenantDbId,
      run_id: runId,
      status: "draft",
      file_name: fileName,
      file_content: fileContent,
      total_amount: totalAmount,
      entry_count: entryCount,
      created_at: now,
      metadata: { payDate: run.pay_date, runTitle: run.title },
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "ach_batch",
    entityId: batch.id,
    action: "create_draft",
    afterSnapshot: batch,
  });

  return { batch: serializeBatch(batch), fileContent, created: true };
}

export async function submitAchBatchForReview({ tenantDbId, batchId, userId }) {
  const batch = await getAchBatch(tenantDbId, batchId);
  if (batch.status !== "draft") throw new Error("Only draft batches can be submitted.");

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.ACH_BATCHES)
    .update({
      status: "pending_review",
      submitted_by: userId || null,
      submitted_at: now,
    })
    .eq("id", batchId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "ach_batch",
    entityId: batchId,
    action: "submit_review",
    beforeSnapshot: batch,
    afterSnapshot: updated,
  });

  return serializeBatch(updated);
}

export async function approveAchBatch({ tenantDbId, batchId, userId }) {
  const batch = await getAchBatch(tenantDbId, batchId);
  if (batch.status !== "pending_review") {
    throw new Error("Only batches pending review can be approved.");
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.ACH_BATCHES)
    .update({
      status: "approved",
      approved_by: userId || null,
      approved_at: now,
    })
    .eq("id", batchId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "ach_batch",
    entityId: batchId,
    action: "approve",
    beforeSnapshot: batch,
    afterSnapshot: updated,
  });

  return serializeBatch(updated);
}

export async function rejectAchBatch({ tenantDbId, batchId, userId, reason = "" }) {
  const batch = await getAchBatch(tenantDbId, batchId);
  if (!["draft", "pending_review"].includes(batch.status)) {
    throw new Error("This batch cannot be rejected.");
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.ACH_BATCHES)
    .update({
      status: "void",
      rejected_reason: String(reason || "").trim(),
      reviewed_by: userId || null,
      reviewed_at: now,
    })
    .eq("id", batchId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "ach_batch",
    entityId: batchId,
    action: "reject",
    beforeSnapshot: batch,
    afterSnapshot: updated,
    notes: reason,
  });

  return serializeBatch(updated);
}

export async function exportAchBatch({ tenantDbId, batchId, userId }) {
  const batch = await getAchBatch(tenantDbId, batchId);
  if (!["approved", "draft", "pending_review"].includes(batch.status)) {
    throw new Error("Batch is not exportable.");
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.ACH_BATCHES)
    .update({
      status: "exported",
      exported_by: userId || null,
      exported_at: now,
    })
    .eq("id", batchId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "ach_batch",
    entityId: batchId,
    action: "export",
    beforeSnapshot: batch,
    afterSnapshot: updated,
  });

  return {
    batch: serializeBatch(updated),
    fileName: updated.file_name,
    fileContent: updated.file_content,
    totalAmount: Number(updated.total_amount || 0),
    entryCount: Number(updated.entry_count || 0),
  };
}

export async function markAchBatchTransmitted({ tenantDbId, batchId, userId }) {
  const batch = await getAchBatch(tenantDbId, batchId);
  if (batch.status !== "exported") {
    throw new Error("Only exported batches can be marked transmitted.");
  }

  const { data: updated, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.ACH_BATCHES)
    .update({ status: "transmitted" })
    .eq("id", batchId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "ach_batch",
    entityId: batchId,
    action: "transmit",
    beforeSnapshot: batch,
    afterSnapshot: updated,
  });

  return serializeBatch(updated);
}

/** Legacy one-step export — creates draft, submits, approves, exports. */
export async function buildAchExportForRun({ tenantDbId, runId, userId }) {
  const { batch, created } = await createAchBatchDraft({ tenantDbId, runId, userId });
  if (created && batch.status === "draft") {
    await submitAchBatchForReview({ tenantDbId, batchId: batch.id, userId });
    await approveAchBatch({ tenantDbId, batchId: batch.id, userId });
  }
  return exportAchBatch({ tenantDbId, batchId: batch.id, userId });
}

async function getAchBatch(tenantDbId, batchId) {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.ACH_BATCHES)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("id", batchId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("ACH batch not found.");
  return data;
}

export { buildAchFileContent } from "./payroll-ach-export.js";
