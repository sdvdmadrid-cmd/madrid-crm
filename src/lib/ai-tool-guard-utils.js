/** Pure AI tool guard helpers (unit-testable). */

export const AI_TOOLS_REQUIRING_CONFIRM = new Set([
  "createInvoice",
  "createInvoiceForJob",
  "sendEstimate",
  "sendInvoice",
  "recordInvoicePayment",
  "runPayrollForPeriod",
  "approvePayrollRun",
  "cleanupDuplicateEmployees",
  "createEstimate",
]);

function stripSensitiveArgs(args = {}) {
  const copy = { ...args };
  delete copy.confirmed;
  return copy;
}

export function describeAiToolAction(toolName, args = {}) {
  const a = stripSensitiveArgs(args);
  switch (toolName) {
    case "createInvoice":
      return `Create invoice for ${a.clientName || a.clientId || "client"} (${a.amount || "amount TBD"})`;
    case "createInvoiceForJob":
      return `Create ${a.billingType || "full"} invoice for job "${a.jobSearch || ""}"`;
    case "sendEstimate":
      return `Send estimate ${a.estimateNumber || a.estimateId || ""} to client`;
    case "runPayrollForPeriod":
      return `Run payroll for period (${a.scheduleType || "weekly"})`;
    case "createEstimate":
      return a.send
        ? `Create and send estimate for ${a.clientName || "client"}`
        : `Create estimate for ${a.clientName || "client"}`;
    case "sendInvoice":
      return `Send invoice ${a.invoiceId || a.query || ""} to client`;
    case "recordInvoicePayment":
      return `Record $${a.amount || "?"} payment on invoice ${a.invoiceId || a.query || ""}`;
    case "approvePayrollRun":
      return `Approve payroll run ${a.runId || "(latest calculated)"}`;
    case "cleanupDuplicateEmployees":
      return "Delete safe duplicate payroll employees";
    default:
      return `Execute ${toolName}`;
  }
}

export function guardAiToolExecution(toolName, args = {}) {
  if (toolName === "createEstimate" && !args.send) return null;
  if (!AI_TOOLS_REQUIRING_CONFIRM.has(toolName)) return null;
  if (args.confirmed === true) return null;

  const preview = describeAiToolAction(toolName, args);
  return {
    ok: false,
    requiresConfirmation: true,
    toolName,
    args: stripSensitiveArgs(args),
    preview,
    message: `${preview}. Tap **Confirm** in the assistant to proceed, or ask again with explicit approval.`,
  };
}
