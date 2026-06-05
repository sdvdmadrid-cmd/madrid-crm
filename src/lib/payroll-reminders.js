import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { upcomingPayPeriods } from "./payroll-calendar.js";
import { getCompanyDocumentBranding } from "./company-document-branding.js";
import { sendPayrollReminderEmail } from "./payroll-email-notifications.js";
import { supabaseAdmin } from "./supabase-admin.js";

export async function listPayrollReminders({ tenantDbId, status = "pending" }) {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.REMINDERS)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("status", status)
    .order("due_date", { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data || []).map(serializeReminder);
}

export async function syncUpcomingRunReminders({
  tenantDbId,
  scheduleType = "biweekly",
}) {
  const periods = upcomingPayPeriods({ scheduleType, count: 2 });
  const next = periods[0];
  if (!next) return [];

  const title = `Payroll due — ${next.periodStart} to ${next.periodEnd}`;
  const dueDate = next.payDate;

  const { data: existing } = await supabaseAdmin
    .from(PAYROLL_TABLES.REMINDERS)
    .select("id")
    .eq("tenant_id", tenantDbId)
    .eq("reminder_type", "upcoming_run")
    .eq("status", "pending")
    .eq("due_date", dueDate)
    .maybeSingle();

  if (existing?.id) {
    return listPayrollReminders({ tenantDbId });
  }

  await supabaseAdmin.from(PAYROLL_TABLES.REMINDERS).insert({
    tenant_id: tenantDbId,
    reminder_type: "upcoming_run",
    title,
    message: `Run payroll for pay date ${dueDate}.`,
    due_date: dueDate,
    status: "pending",
    metadata: { period: next },
  });

  getCompanyDocumentBranding(tenantDbId)
    .then((branding) => {
      if (!branding.email) return null;
      return sendPayrollReminderEmail({
        tenantId: tenantDbId,
        to: branding.email,
        title,
        message: `Run payroll for pay date ${dueDate}.`,
        dueDate,
      });
    })
    .catch(() => {});

  return listPayrollReminders({ tenantDbId });
}

export async function dismissPayrollReminder({ tenantDbId, reminderId }) {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.REMINDERS)
    .update({ status: "dismissed" })
    .eq("tenant_id", tenantDbId)
    .eq("id", reminderId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return serializeReminder(data);
}

function serializeReminder(row = {}) {
  return {
    id: row.id,
    reminderType: row.reminder_type,
    title: row.title,
    message: row.message,
    dueDate: row.due_date,
    runId: row.run_id || null,
    status: row.status,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}
