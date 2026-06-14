import "server-only";

import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { getCalendarEventsForRange } from "@/lib/calendar-events-server";
import { buildJobInsertFromEstimate } from "@/lib/estimate-to-job";
import { normalizeEstimateStatusToken } from "@/lib/estimate-serializer";
import { normalizeRecipients, sendEmail } from "@/lib/email";
import { PAYROLL_TABLES } from "@/lib/payroll-constants";
import {
  findDuplicateEmployeeGroups,
} from "@/lib/payroll-employee-duplicates";
import {
  approvePayrollRun,
  deletePayrollEmployeePermanently,
} from "@/lib/payroll-service";
import {
  buildEmployeeInsertRow,
  serializePayrollEmployee,
} from "@/lib/payroll-serializer";
import { getPayrollSettingsForTenant } from "@/lib/payroll-settings-service.js";
import {
  getContractorSubscription,
  recordManualInvoicePayment,
} from "@/lib/stripe-payments";
import {
  resolveSubscriptionAccess,
  SUBSCRIPTION_STATES,
} from "@/lib/subscription-access-core";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";
import { scoreTextMatch } from "./helpers.js";
import { resolveDateRange } from "./date-range.js";

export { resolveDateRange } from "./date-range.js";

async function findInvoice(tenantId, { invoiceId, query }) {
  const id = String(invoiceId || "").trim();
  if (id) {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  const q = String(query || "").trim();
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw new Error(error.message);

  const rows = (data || [])
    .map((row) => ({
      row,
      score: Math.max(scoreTextMatch(row.client_name, q), scoreTextMatch(row.invoice_number, q)),
    }))
    .filter((r) => (q ? r.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.row);

  return rows[0] || null;
}

export async function aiSendInvoice(tenantId, userId, role, args = {}) {
  const invoice = await findInvoice(tenantId, args);
  if (!invoice) return { ok: false, error: "No matching invoice found." };

  const recipientEmail =
    normalizeRecipients([
      String(args.recipientEmail || "").trim(),
      invoice.client_email,
    ])[0] || "";

  if (!recipientEmail) {
    return {
      ok: false,
      error: "No client email on file. Add client email or provide recipientEmail.",
    };
  }

  const companyProfile = await getCompanyProfileByTenant({ tenantId });
  const companyName =
    companyProfile?.publicDisplayName || companyProfile?.companyName || "FieldBase";
  const amount = Number(invoice.balance_due ?? invoice.amount ?? 0).toFixed(2);

  const subject = `${companyName} - ${invoice.invoice_number || "Invoice"}`;
  const text = [
    `Hi ${invoice.client_name || "Client"},`,
    "",
    `Your invoice ${invoice.invoice_number || ""} is ready.`,
    `Amount due: $${amount}`,
    invoice.due_date ? `Due date: ${invoice.due_date}` : "",
    "",
    "Thank you,",
    companyName,
  ]
    .filter(Boolean)
    .join("\n");

  const sendResult = await sendEmail({
    to: recipientEmail,
    subject,
    text,
    html: `<p>${text.replace(/\n/g, "<br />")}</p>`,
    metadata: {
      tenantId,
      invoiceId: invoice.id,
      invoiceNumber: String(invoice.invoice_number || ""),
      recipient: recipientEmail,
    },
  });

  const nowIso = new Date().toISOString();
  if (sendResult.success) {
    await supabaseAdmin
      .from("invoices")
      .update({
        invoice_email_sent_at: nowIso,
        invoice_email_sent_to: recipientEmail,
        invoice_email_last_attempt_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", invoice.id)
      .eq("tenant_id", tenantId);
  }

  return {
    ok: sendResult.success,
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientName: invoice.client_name,
      sentTo: recipientEmail,
    },
    delivery: sendResult,
    error: sendResult.success ? undefined : sendResult.error || "Email delivery failed",
  };
}

export async function aiRecordInvoicePayment(tenantId, userId, role, args = {}) {
  const invoice = await findInvoice(tenantId, args);
  if (!invoice) return { ok: false, error: "No matching invoice found." };

  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a positive number" };
  }

  const access = {
    context: { userId, tenantDbId: tenantId, role },
    invoice,
  };

  const { response, invoice: updated } = await recordManualInvoicePayment({
    access,
    body: {
      amount,
      method: String(args.method || "other").trim(),
      reference: String(args.reference || "").trim(),
      notes: String(args.notes || "Recorded via AI assistant").trim(),
      date: String(args.paymentDate || "").trim() || undefined,
    },
  });

  if (response) {
    const payload = await response.json().catch(() => ({}));
    return { ok: false, error: payload.error || "Unable to record payment" };
  }

  return {
    ok: true,
    invoice: {
      id: updated?.id || invoice.id,
      invoiceNumber: updated?.invoice_number || invoice.invoice_number,
      status: updated?.status,
      balanceDue: updated?.balance_due,
    },
  };
}

export async function aiGetScheduleForRange(tenantId, role, args = {}) {
  const { from, to } = resolveDateRange(args);

  const [calendarEvents, appointmentsResult] = await Promise.all([
    getCalendarEventsForRange({ tenantDbId: tenantId, role, from, to }),
    scopeByTenant(
      supabaseAdmin
        .from("appointments")
        .select("id, title, client, date, time, end_time, location, status, notes")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true })
        .order("time", { ascending: true }),
      { tenantDbId: tenantId, role },
    ),
  ]);

  if (appointmentsResult.error) throw new Error(appointmentsResult.error.message);

  return {
    ok: true,
    range: { from, to },
    jobs: calendarEvents.jobs || [],
    estimates: calendarEvents.estimates || [],
    appointments: (appointmentsResult.data || []).map((row) => ({
      id: row.id,
      title: row.title,
      clientName: row.client,
      date: row.date,
      time: row.time,
      endTime: row.end_time,
      location: row.location,
      status: row.status,
      notes: row.notes,
    })),
    totalCount:
      (calendarEvents.jobs?.length || 0) +
      (calendarEvents.estimates?.length || 0) +
      (appointmentsResult.data?.length || 0),
  };
}

export async function aiDetectScheduleConflicts(tenantId, role, args = {}) {
  const date = String(args.date || "").trim();
  const time = String(args.time || "").trim();
  if (!isValidYmd(date)) {
    return { ok: false, error: "date must be YYYY-MM-DD" };
  }

  let query = supabaseAdmin
    .from("appointments")
    .select("id, title, client, date, time, end_time, status")
    .eq("date", date)
    .neq("status", "cancelled");

  const { data, error } = await scopeByTenant(query, { tenantDbId: tenantId, role });
  if (error) throw new Error(error.message);

  const appointments = data || [];
  let conflicts = appointments;

  if (time) {
    conflicts = appointments.filter((row) => {
      const rowTime = String(row.time || "").slice(0, 5);
      const target = time.slice(0, 5);
      return rowTime === target;
    });
  }

  const suggestions = [];
  if (conflicts.length > 0) {
    for (let hour = 8; hour <= 17; hour += 1) {
      const slot = `${String(hour).padStart(2, "0")}:00`;
      const taken = appointments.some((a) => String(a.time || "").slice(0, 5) === slot);
      if (!taken) suggestions.push({ date, time: slot });
      if (suggestions.length >= 3) break;
    }
  }

  return {
    ok: true,
    date,
    time: time || null,
    conflictCount: conflicts.length,
    conflicts: conflicts.map((row) => ({
      id: row.id,
      title: row.title,
      clientName: row.client,
      time: row.time,
    })),
    suggestedSlots: suggestions,
  };
}

async function findAppointment(tenantId, role, args = {}) {
  const id = String(args.appointmentId || "").trim();
  if (id) {
    const { data, error } = await scopeByTenant(
      supabaseAdmin.from("appointments").select("*").eq("id", id).maybeSingle(),
      { tenantDbId: tenantId, role },
    );
    if (error) throw new Error(error.message);
    return data;
  }

  const q = String(args.query || args.clientName || "").trim();
  const { data, error } = await scopeByTenant(
    supabaseAdmin
      .from("appointments")
      .select("*")
      .order("date", { ascending: false })
      .limit(100),
    { tenantDbId: tenantId, role },
  );
  if (error) throw new Error(error.message);

  return (data || [])
    .map((row) => ({
      row,
      score: Math.max(
        scoreTextMatch(row.client, q),
        scoreTextMatch(row.title, q),
        scoreTextMatch(row.date, q),
      ),
    }))
    .filter((r) => (q ? r.score > 0 : true))
    .sort((a, b) => b.score - a.score)[0]?.row || null;
}

export async function aiUpdateAppointment(tenantId, role, args = {}) {
  const appointment = await findAppointment(tenantId, role, args);
  if (!appointment) return { ok: false, error: "No matching appointment found." };

  const patch = { updated_at: new Date().toISOString() };
  if (args.date && isValidYmd(args.date)) patch.date = args.date;
  if (args.time) patch.time = String(args.time).trim();
  if (args.endTime) patch.end_time = String(args.endTime).trim();
  if (args.title) patch.title = String(args.title).trim();
  if (args.clientName) patch.client = String(args.clientName).trim();
  if (args.location) patch.location = String(args.location).trim();
  if (args.status) patch.status = String(args.status).trim().toLowerCase();
  if (args.crew) {
    patch.notes = [appointment.notes, `Crew: ${args.crew}`].filter(Boolean).join("\n");
  }

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .update(patch)
    .eq("id", appointment.id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    ok: true,
    appointment: {
      id: data.id,
      title: data.title,
      clientName: data.client,
      date: data.date,
      time: data.time,
    },
  };
}

export async function aiCancelAppointment(tenantId, role, args = {}) {
  return aiUpdateAppointment(tenantId, role, {
    ...args,
    status: "cancelled",
  });
}

async function findEstimate(tenantId, args = {}) {
  const id = String(args.estimateId || "").trim();
  if (id) {
    const { data, error } = await supabaseAdmin
      .from("estimates")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  const q = String(args.estimateQuery || args.query || "").trim();
  const { data, error } = await supabaseAdmin
    .from("estimates")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  return (data || [])
    .map((row) => ({
      row,
      score: Math.max(scoreTextMatch(row.client_name, q), scoreTextMatch(row.estimate_number, q)),
    }))
    .filter((r) => (q ? r.score > 0 : true))
    .sort((a, b) => b.score - a.score)[0]?.row || null;
}

export async function aiConvertEstimateToJob(tenantId, userId, role, args = {}) {
  const estimate = await findEstimate(tenantId, args);
  if (!estimate) return { ok: false, error: "No matching estimate found." };

  const status = normalizeEstimateStatusToken(estimate.status);
  if (status !== "approved") {
    return {
      ok: false,
      error: `Estimate must be approved before converting (current: ${estimate.status}).`,
    };
  }

  const existingJobId = String(estimate.job_id || "").trim();
  if (existingJobId) {
    const { data: existingJob } = await supabaseAdmin
      .from("jobs")
      .select("id, title, client_name, status")
      .eq("id", existingJobId)
      .maybeSingle();
    if (existingJob) {
      return {
        ok: true,
        job: existingJob,
        alreadyLinked: true,
        estimateId: estimate.id,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const jobRow = buildJobInsertFromEstimate(estimate, { tenantId, userId, nowIso });
  const { data: job, error: insertError } = await supabaseAdmin
    .from("jobs")
    .insert(jobRow)
    .select("id, title, client_name, status")
    .single();
  if (insertError) throw new Error(insertError.message);

  await supabaseAdmin
    .from("estimates")
    .update({ job_id: job.id, updated_at: nowIso })
    .eq("id", estimate.id);

  return {
    ok: true,
    job,
    estimateId: estimate.id,
    alreadyLinked: false,
  };
}

export async function aiFindDuplicateEmployees(tenantId, role) {
  const groups = await findDuplicateEmployeeGroups({ tenantDbId: tenantId, role });
  return {
    ok: true,
    groupCount: groups.length,
    duplicateEmployeeCount: groups.reduce((sum, g) => sum + g.employees.length, 0),
    groups: groups.map((g) => ({
      reasons: g.reasons,
      suggestedKeepId: g.suggestedKeepId,
      safeDeleteIds: g.safeDeleteIds,
      employees: g.employees.map((e) => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`.trim(),
        email: e.email,
        payrollHistoryCount: e.payrollHistoryCount,
        canPermanentlyDelete: e.canPermanentlyDelete,
      })),
    })),
  };
}

export async function aiCleanupDuplicateEmployees(tenantId, role, args = {}) {
  const groups = await findDuplicateEmployeeGroups({ tenantDbId: tenantId, role });
  const toDelete = [];

  for (const group of groups) {
    for (const id of group.safeDeleteIds || []) {
      toDelete.push(id);
    }
  }

  if (!toDelete.length) {
    return {
      ok: true,
      deleted: [],
      message: "No safe duplicate employees to remove (all duplicates have payroll history).",
    };
  }

  const deleteIds = args.employeeIds?.length
    ? args.employeeIds.filter((id) => toDelete.includes(id))
    : toDelete;

  const deleted = [];
  const failed = [];
  for (const employeeId of deleteIds) {
    try {
      await deletePayrollEmployeePermanently({ tenantDbId: tenantId, role, employeeId });
      deleted.push(employeeId);
    } catch (error) {
      failed.push({ employeeId, error: error?.message || "Delete failed" });
    }
  }

  return { ok: failed.length === 0, deleted, failed, attempted: deleteIds.length };
}

export async function aiCreatePayrollEmployee(tenantId, userId, role, args = {}) {
  const firstName = String(args.firstName || "").trim();
  const lastName = String(args.lastName || "").trim();
  if (!firstName || !lastName) {
    return { ok: false, error: "firstName and lastName are required" };
  }

  const settings = await getPayrollSettingsForTenant({ tenantDbId: tenantId, role });
  const row = buildEmployeeInsertRow(args, tenantId, userId);
  if (!row.work_state && settings.defaultWorkState) {
    row.work_state = String(settings.defaultWorkState).toUpperCase();
  }
  row.created_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.EMPLOYEES)
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    ok: true,
    employee: serializePayrollEmployee(data),
  };
}

export async function aiDeactivatePayrollEmployee(tenantId, role, args = {}) {
  const id = String(args.employeeId || "").trim();
  let employeeId = id;

  if (!employeeId) {
    const q = String(args.employeeName || args.query || "").trim();
    const { data, error } = await scopeByTenant(
      supabaseAdmin.from(PAYROLL_TABLES.EMPLOYEES).select("*").limit(200),
      { tenantDbId: tenantId, role },
    );
    if (error) throw new Error(error.message);
    const match = (data || [])
      .map((row) => {
        const serialized = serializePayrollEmployee(row);
        const full = `${serialized.firstName} ${serialized.lastName}`.trim();
        return { row, score: scoreTextMatch(full, q) || scoreTextMatch(serialized.email, q) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)[0];
    employeeId = match?.row?.id;
  }

  if (!employeeId) return { ok: false, error: "No matching employee found." };

  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.EMPLOYEES)
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return { ok: true, employee: serializePayrollEmployee(data) };
}

export async function aiApprovePayrollRun(tenantId, role, userId, args = {}) {
  let runId = String(args.runId || "").trim();

  if (!runId) {
    const { data, error } = await scopeByTenant(
      supabaseAdmin
        .from(PAYROLL_TABLES.RUNS)
        .select("id, status, title")
        .eq("status", "calculated")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      { tenantDbId: tenantId, role },
    );
    if (error) throw new Error(error.message);
    runId = data?.id;
    if (!runId) return { ok: false, error: "No calculated pay run ready for approval." };
  }

  const result = await approvePayrollRun({ tenantDbId: tenantId, role, runId, userId });
  return { ok: true, runId, run: result.run };
}

function describeSubscriptionState(access, subscription) {
  switch (access.state) {
    case SUBSCRIPTION_STATES.SUPER_ADMIN:
      return "Super admin — full platform access.";
    case SUBSCRIPTION_STATES.COMPLIMENTARY:
      return "Complimentary account — full access at no charge.";
    case SUBSCRIPTION_STATES.ACTIVE:
      return `Active subscription on ${subscription?.subscription_plans?.name || "your plan"}.`;
    case SUBSCRIPTION_STATES.STRIPE_TRIALING:
      return "Stripe trial is active.";
    case SUBSCRIPTION_STATES.TRIAL:
      return `Free trial active until ${subscription?.trial_ends_at || "trial end"}.`;
    case SUBSCRIPTION_STATES.EXPIRED_TRIAL:
      return "Trial expired — subscribe to restore full access.";
    case SUBSCRIPTION_STATES.PAST_DUE:
      return "Payment past due — update billing to avoid restrictions.";
    case SUBSCRIPTION_STATES.CANCELLED:
      return "Subscription cancelled — resubscribe to restore access.";
    default:
      return "Subscription status unknown.";
  }
}

export async function aiGetSubscriptionStatus(tenantId, role) {
  const subscription = await getContractorSubscription(tenantId);
  const access = resolveSubscriptionAccess({
    role,
    isSubscribed: ["active", "trialing"].includes(String(subscription?.status || "").toLowerCase()),
    stripeSubscriptionStatus: subscription?.status,
    trialEndDate: subscription?.trial_ends_at,
    complimentaryAccess: Boolean(subscription?.metadata?.complimentary),
  });

  return {
    ok: true,
    status: subscription?.status || "none",
    planName: subscription?.subscription_plans?.name || null,
    trialEndsAt: subscription?.trial_ends_at || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    hasBusinessAccess: access.hasBusinessAccess,
    isRestricted: access.isRestricted,
    state: access.state,
    explanation: describeSubscriptionState(access, subscription),
  };
}

async function findJob(tenantId, args = {}) {
  const id = String(args.jobId || "").trim();
  if (id) {
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  const q = String(args.jobSearch || args.query || args.title || "").trim();
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  return (data || [])
    .map((row) => ({
      row,
      score: Math.max(scoreTextMatch(row.title, q), scoreTextMatch(row.client_name, q)),
    }))
    .filter((r) => (q ? r.score > 0 : true))
    .sort((a, b) => b.score - a.score)[0]?.row || null;
}

export async function aiUpdateJob(tenantId, args = {}) {
  const job = await findJob(tenantId, args);
  if (!job) return { ok: false, error: "No matching job found." };

  const patch = { updated_at: new Date().toISOString() };
  if (args.title) patch.title = String(args.title).trim();
  if (args.status) patch.status = String(args.status).trim();
  if (args.dueDate && isValidYmd(args.dueDate)) patch.due_date = args.dueDate;
  if (args.description) patch.description = String(args.description).trim();
  if (args.price) patch.price = String(args.price).trim();
  if (args.crew) {
    patch.scope_details = [job.scope_details, `Crew: ${args.crew}`].filter(Boolean).join("\n");
  }

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update(patch)
    .eq("id", job.id)
    .eq("tenant_id", tenantId)
    .select("id, title, client_name, status, due_date")
    .single();
  if (error) throw new Error(error.message);

  return { ok: true, job: data };
}
