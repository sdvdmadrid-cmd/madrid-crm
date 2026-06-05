import "server-only";

import { logEmailAttempt, sendEmail } from "./email.js";

const APP_BASE = String(
  process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
).replace(/\/$/, "");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendPayrollEmail({ tenantId, to, subject, html, text, eventType, metadata = {} }) {
  const result = await sendEmail({
    to,
    subject,
    html,
    text,
    metadata: { ...metadata, tenantId, type: eventType },
  });

  await logEmailAttempt({
    tenantId,
    recipient: Array.isArray(to) ? to[0] : to,
    eventType,
    success: Boolean(result?.success),
    error: result?.error || null,
    metadata,
  });

  return result;
}

export async function sendPayStubDeliveryEmail({
  tenantId,
  to,
  employeeName,
  companyName,
  payDate,
  netPay,
  hasAttachment,
  attachments = [],
}) {
  const subject = `Pay stub from ${companyName} — ${payDate}`;
  const html = `
    <p>Hi ${escapeHtml(employeeName)},</p>
    <p>Your pay stub for <strong>${escapeHtml(payDate)}</strong> is attached.</p>
    <p>Net pay: <strong>$${Number(netPay || 0).toFixed(2)}</strong></p>
    ${hasAttachment ? "<p>See the attached PDF for full details.</p>" : ""}
    <p>— ${escapeHtml(companyName)} via FieldBase Payroll</p>
  `;
  const text = `Pay stub from ${companyName} for ${payDate}. Net pay: $${Number(netPay || 0).toFixed(2)}.`;

  const result = await sendEmail({
    to,
    subject,
    html,
    text,
    attachments,
    metadata: { tenantId, type: "payroll_stub_delivered", payDate, netPay },
  });

  await logEmailAttempt({
    tenantId,
    recipient: Array.isArray(to) ? to[0] : to,
    eventType: "payroll_stub_delivered",
    success: Boolean(result?.success),
    error: result?.error || null,
    metadata: { payDate, netPay },
  });

  return result;
}

export async function sendPayrollReminderEmail({
  tenantId,
  to,
  title,
  message,
  dueDate,
}) {
  const subject = `Payroll reminder: ${title}`;
  const html = `
    <p>${escapeHtml(message)}</p>
    <p>Due date: <strong>${escapeHtml(dueDate)}</strong></p>
    <p><a href="${APP_BASE}/payroll/runs">Open payroll runs</a></p>
  `;
  return sendPayrollEmail({
    tenantId,
    to,
    subject,
    html,
    text: `${message} Due: ${dueDate}`,
    eventType: "payroll_reminder",
    metadata: { dueDate, title },
  });
}

export async function sendPayrollApprovalEmail({
  tenantId,
  to,
  runTitle,
  payDate,
  totalNet,
  action = "approved",
}) {
  const subject =
    action === "approved"
      ? `Pay run approved: ${runTitle}`
      : `Pay run finalized: ${runTitle}`;
  const html = `
    <p>Pay run <strong>${escapeHtml(runTitle)}</strong> has been ${escapeHtml(action)}.</p>
    <p>Pay date: ${escapeHtml(payDate)} | Total net: $${Number(totalNet || 0).toFixed(2)}</p>
    <p><a href="${APP_BASE}/payroll/runs">View pay runs</a></p>
  `;
  return sendPayrollEmail({
    tenantId,
    to,
    subject,
    html,
    text: `${runTitle} ${action}. Pay date ${payDate}.`,
    eventType: `payroll_run_${action}`,
    metadata: { runTitle, payDate, totalNet },
  });
}

export async function sendAchWorkflowEmail({
  tenantId,
  to,
  batchStatus,
  runTitle,
  totalAmount,
  entryCount,
  reason = "",
}) {
  const labels = {
    pending_review: "ACH batch submitted for review",
    approved: "ACH batch approved",
    rejected: "ACH batch rejected",
    exported: "ACH file ready for download",
    transmitted: "ACH batch marked transmitted",
  };
  const subject = labels[batchStatus] || `ACH update: ${runTitle}`;
  const html = `
    <p>${escapeHtml(subject)}</p>
    <p>Run: ${escapeHtml(runTitle)}</p>
    <p>Total: $${Number(totalAmount || 0).toFixed(2)} (${entryCount} entries)</p>
    ${reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ""}
    <p><a href="${APP_BASE}/payroll/runs">Open payroll</a></p>
  `;
  return sendPayrollEmail({
    tenantId,
    to,
    subject,
    html,
    text: `${subject}. $${Number(totalAmount || 0).toFixed(2)}.`,
    eventType: `payroll_ach_${batchStatus}`,
    metadata: { batchStatus, totalAmount, entryCount },
  });
}

export async function sendAchFailureEmail({
  tenantId,
  to,
  runTitle,
  errorMessage,
}) {
  const subject = `ACH processing failed: ${runTitle}`;
  const html = `
    <p>ACH export or transmission failed for <strong>${escapeHtml(runTitle)}</strong>.</p>
    <p>Error: ${escapeHtml(errorMessage)}</p>
    <p><a href="${APP_BASE}/payroll/runs">Review pay run</a></p>
  `;
  return sendPayrollEmail({
    tenantId,
    to,
    subject,
    html,
    text: `ACH failed for ${runTitle}: ${errorMessage}`,
    eventType: "payroll_ach_failed",
    metadata: { errorMessage },
  });
}
