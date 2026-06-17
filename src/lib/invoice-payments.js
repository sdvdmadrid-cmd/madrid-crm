const ALLOWED_PAYMENT_METHODS = new Set([
  "bank_transfer",
  "credit_card",
  "debit_card",
  "cash",
  "check",
  "zelle",
  "venmo",
  "paypal",
  "other",
]);

const REFERENCE_REQUIRED_METHODS = new Set([
  "bank_transfer",
  "credit_card",
  "debit_card",
  "check",
  "zelle",
  "venmo",
  "paypal",
]);

const NOTES_REQUIRED_METHODS = new Set(["cash", "other"]);

export function normalizeMoney(value) {
  const normalized = String(value ?? "")
    .replace(/[^0-9.-]/g, "")
    .trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Number(parsed.toFixed(2)));
}

export function normalizePaymentMethod(value) {
  const method = String(value || "")
    .trim()
    .toLowerCase();
  if (ALLOWED_PAYMENT_METHODS.has(method)) return method;
  return "other";
}

export function sanitizePaymentEntry(value = {}) {
  const amount = normalizeMoney(value.amount);
  const date = String(value.date || "").trim();

  return {
    amount,
    method: normalizePaymentMethod(value.method),
    reference: String(value.reference || "")
      .trim()
      .slice(0, 120),
    notes: String(value.notes || "")
      .trim()
      .slice(0, 500),
    date,
    createdAt: new Date().toISOString(),
  };
}

export function validatePaymentInput(value = {}, options = {}) {
  const payment = sanitizePaymentEntry(value);
  const maxAmount = Number(options.maxAmount || 0);

  if (!(payment.amount > 0)) {
    return {
      valid: false,
      error: "Payment amount must be greater than 0",
      payment,
    };
  }

  if (
    Number.isFinite(maxAmount) &&
    maxAmount > 0 &&
    payment.amount > maxAmount
  ) {
    return {
      valid: false,
      error: `Payment amount exceeds remaining balance (${maxAmount.toFixed(2)})`,
      payment,
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.date)) {
    return {
      valid: false,
      error: "Payment date is required in YYYY-MM-DD format",
      payment,
    };
  }

  if (REFERENCE_REQUIRED_METHODS.has(payment.method) && !payment.reference) {
    return {
      valid: false,
      error: "Reference is required for this payment method",
      payment,
    };
  }

  if (NOTES_REQUIRED_METHODS.has(payment.method) && !payment.notes) {
    return {
      valid: false,
      error: "Notes are required for this payment method",
      payment,
    };
  }

  return { valid: true, payment };
}

export function sanitizePaymentList(values = []) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => sanitizePaymentEntry(item))
    .filter((item) => item.amount > 0);
}

/** API/UI invoice shape from Supabase row */
export function serializeInvoiceRow(doc = {}) {
  const amount = Number(
    doc.amount ?? (Number(doc.total_cents || 0) / 100 || 0),
  );
  const base = {
    _id: doc.id,
    id: doc.id,
    tenantId: doc.tenant_id || "",
    userId: doc.user_id || null,
    invoiceNumber: doc.invoice_number || "",
    invoiceTitle: doc.invoice_title || "",
    quoteId: doc.quote_id || null,
    quoteNumber: doc.quote_number || "",
    jobId: doc.job_id || "",
    clientId: doc.client_id || "",
    clientName: doc.client_name || "",
    clientEmail: doc.client_email || "",
    clientPhone: doc.client_phone || "",
    clientAddress: doc.client_address || "",
    propertyAddress: doc.property_address || "",
    amount: amount ? String(amount) : "",
    dueDate: doc.due_date ? String(doc.due_date).slice(0, 10) : "",
    lineItems: Array.isArray(doc.items) ? doc.items : [],
    notes: doc.notes || "",
    preferredPaymentMethod: normalizePaymentMethod(doc.preferred_payment_method),
    payments: Array.isArray(doc.payments) ? doc.payments : [],
    paidAmount: Number(doc.paid_amount || 0),
    balanceDue: Number(doc.balance_due || 0),
    status: doc.status || "Unpaid",
    createdAt: doc.created_at || null,
    updatedAt: doc.updated_at || null,
  };

  const paymentState = computeInvoicePaymentState(base);
  return {
    ...base,
    ...paymentState,
    status: resolveInvoiceStatus({ ...base, ...paymentState }),
  };
}

export const MANUAL_INVOICE_STATUSES = new Set([
  "Draft",
  "Sent",
  "Viewed",
  "Cancelled",
]);

export const COMPUTED_INVOICE_STATUSES = new Set([
  "Paid",
  "Partial",
  "Overdue",
]);

export function isInvoiceOverdue(invoice = {}, balanceDue = 0) {
  const amount = normalizeMoney(invoice.amount);
  if (!(amount > 0) || !(balanceDue > 0)) return false;
  const dueDate = String(invoice.dueDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return false;
  const due = new Date(`${dueDate}T23:59:59`);
  return Number.isFinite(due.getTime()) && due < new Date();
}

export function computeInvoicePaymentState(invoice = {}) {
  const amount = normalizeMoney(invoice.amount);
  const payments = sanitizePaymentList(invoice.payments || []);
  const paidAmount = Number(
    payments
      .reduce((sum, item) => sum + normalizeMoney(item.amount), 0)
      .toFixed(2),
  );
  const balanceDue = Number(Math.max(0, amount - paidAmount).toFixed(2));

  let status = "Sent";
  if (amount > 0 && balanceDue <= 0) {
    status = "Paid";
  } else if (paidAmount > 0 && balanceDue > 0) {
    status = "Partial";
  }

  return {
    payments,
    paidAmount,
    balanceDue,
    status,
  };
}

/** Merge workflow status with payment-derived state for API/UI display. */
export function resolveInvoiceStatus(invoice = {}, options = {}) {
  const requested = String(
    options.requestedStatus ?? invoice.status ?? "Sent",
  ).trim();
  const amount = normalizeMoney(invoice.amount);
  const paymentState = computeInvoicePaymentState(invoice);
  const { paidAmount, balanceDue } = paymentState;

  if (requested === "Cancelled" || invoice.status === "Cancelled") {
    return "Cancelled";
  }

  if (amount > 0 && balanceDue <= 0) return "Paid";
  if (paidAmount > 0 && balanceDue > 0) return "Partial";

  if (isInvoiceOverdue(invoice, balanceDue)) return "Overdue";

  if (requested === "Draft" && paidAmount <= 0) return "Draft";
  if (MANUAL_INVOICE_STATUSES.has(requested)) return requested;
  if (MANUAL_INVOICE_STATUSES.has(invoice.status)) return invoice.status;

  if (invoice.status === "Unpaid" || !invoice.status) return "Sent";
  return invoice.status || "Sent";
}
