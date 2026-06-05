import "server-only";

import { BILL_TABLE } from "./bill-payments.js";
import { roundMoney } from "./payroll-money.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { scopeByTenant } from "./tenant-scope.js";
import { getVendorById } from "./vendor-service.js";

function toText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export function computeExpenseBillStatus(row = {}) {
  const status = String(row.status || "open").toLowerCase();
  if (status === "paid" || status === "cancelled") return status;
  const due = row.due_date || row.dueDate;
  if (due && status === "open") {
    const today = new Date().toISOString().slice(0, 10);
    if (String(due) < today) return "overdue";
  }
  return status || "open";
}

export function serializeExpenseBill(row = {}, vendor = null) {
  const vendorPayload =
    vendor && typeof vendor === "object"
      ? vendor
      : row.vendors
        ? {
            id: row.vendors.id,
            name: row.vendors.name,
            category: row.vendors.category,
          }
        : null;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    vendorId: row.vendor_id || null,
    vendor: vendorPayload,
    vendorName: vendorPayload?.name || row.provider_name || "",
    jobId: row.job_id || null,
    amountDue: Number(row.amount_due || 0),
    dueDate: row.due_date || null,
    status: computeExpenseBillStatus(row),
    category: row.category || "general",
    isRecurring: Boolean(row.is_recurring),
    frequency: row.frequency || null,
    notes: row.notes || "",
    portalUrl: row.portal_url || "",
    attachmentPath: row.attachment_path || "",
    attachmentName: row.attachment_name || "",
    tags: row.tags || [],
    lastPaidAt: row.last_paid_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function buildExpenseBillRow(body = {}, tenantId, userId) {
  const now = new Date().toISOString();
  return {
    tenant_id: tenantId,
    user_id: userId,
    vendor_id: body.vendorId || null,
    job_id: body.jobId || null,
    provider_id: null,
    provider_name: toText(body.vendorName || body.providerName, 200),
    account_label: toText(body.accountLabel, 120),
    amount_due: roundMoney(body.amountDue ?? 0),
    due_date: body.dueDate || new Date().toISOString().slice(0, 10),
    status: body.status === "paid" ? "paid" : "open",
    category: toText(body.category || "general", 40),
    is_recurring: Boolean(body.isRecurring),
    frequency: body.isRecurring ? body.frequency || "monthly" : null,
    notes: toText(body.notes, 2000),
    portal_url: toText(body.portalUrl, 500),
    source: "manual",
    tags: Array.isArray(body.tags) ? body.tags : [],
    autopay_enabled: false,
    created_at: now,
    updated_at: now,
  };
}

export async function listExpenseBills({ tenantDbId, role, status, vendorId, jobId }) {
  let query = supabaseAdmin
    .from(BILL_TABLE)
    .select("*, vendors(id, name, category)")
    .eq("tenant_id", tenantDbId)
    .order("due_date", { ascending: true });

  if (status) query = query.eq("status", status);
  if (vendorId) query = query.eq("vendor_id", vendorId);
  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await scopeByTenant(query, { tenantDbId, role });
  if (error) throw new Error(error.message);

  return (data || []).map((row) => serializeExpenseBill(row));
}

export async function createExpenseBill({ tenantDbId, role, userId, body }) {
  if (!body?.vendorId && !toText(body?.vendorName)) {
    throw new Error("Select a vendor or enter a vendor name.");
  }

  let vendorName = toText(body.vendorName);
  if (body.vendorId) {
    const vendor = await getVendorById({ tenantDbId, role, vendorId: body.vendorId });
    if (!vendor) throw new Error("Vendor not found.");
    vendorName = vendor.name;
  }

  const row = buildExpenseBillRow({ ...body, vendorName }, tenantDbId, userId);
  const { data, error } = await supabaseAdmin.from(BILL_TABLE).insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return serializeExpenseBill(data, vendorName ? { name: vendorName } : null);
}

export async function updateExpenseBill({ tenantDbId, role, billId, body }) {
  const updateRow = { updated_at: new Date().toISOString() };

  if ("vendorId" in body) updateRow.vendor_id = body.vendorId || null;
  if ("jobId" in body) updateRow.job_id = body.jobId || null;
  if ("amountDue" in body) updateRow.amount_due = roundMoney(body.amountDue);
  if ("dueDate" in body) updateRow.due_date = body.dueDate;
  if ("category" in body) updateRow.category = toText(body.category, 40);
  if ("notes" in body) updateRow.notes = toText(body.notes, 2000);
  if ("portalUrl" in body) updateRow.portal_url = toText(body.portalUrl, 500);
  if ("isRecurring" in body) {
    updateRow.is_recurring = Boolean(body.isRecurring);
    updateRow.frequency = body.isRecurring ? body.frequency || "monthly" : null;
  }
  if ("status" in body) {
    const status = String(body.status || "").toLowerCase();
    updateRow.status = status === "paid" ? "paid" : status === "cancelled" ? "cancelled" : "open";
    if (status === "paid") updateRow.last_paid_at = new Date().toISOString();
  }
  if (body.vendorId) {
    const vendor = await getVendorById({ tenantDbId, role, vendorId: body.vendorId });
    if (vendor) {
      updateRow.provider_name = vendor.name;
      updateRow.vendor_id = vendor.id;
    }
  }

  const { data, error } = await scopeByTenant(
    supabaseAdmin.from(BILL_TABLE).update(updateRow).eq("id", billId).select("*").maybeSingle(),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Bill not found.");
  return serializeExpenseBill(data);
}

export async function deleteExpenseBill({ tenantDbId, role, billId }) {
  const { error } = await scopeByTenant(
    supabaseAdmin.from(BILL_TABLE).delete().eq("id", billId),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
}

export async function sumJobAssignedBills(tenantDbId, jobId) {
  const { data, error } = await supabaseAdmin
    .from(BILL_TABLE)
    .select("amount_due, status")
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId)
    .in("status", ["open", "paid", "overdue"]);

  if (error) throw new Error(error.message);

  return roundMoney(
    (data || []).reduce((sum, row) => sum + Number(row.amount_due || 0), 0),
  );
}

export function expenseBillsToCsv(bills = []) {
  const header = [
    "Vendor",
    "Amount",
    "Due Date",
    "Status",
    "Category",
    "Job ID",
    "Recurring",
    "Notes",
  ];
  const lines = [header.join(",")];
  for (const bill of bills) {
    lines.push(
      [
        `"${String(bill.vendorName || "").replace(/"/g, '""')}"`,
        bill.amountDue,
        bill.dueDate || "",
        bill.status,
        bill.category,
        bill.jobId || "",
        bill.isRecurring ? bill.frequency || "yes" : "no",
        `"${String(bill.notes || "").replace(/"/g, '""')}"`,
      ].join(","),
    );
  }
  return lines.join("\n");
}
