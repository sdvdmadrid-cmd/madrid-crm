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

export function computeInvoicePaymentState(invoice = {}) {
  const amount = normalizeMoney(invoice.amount);
  const payments = sanitizePaymentList(invoice.payments || []);
  const paidAmount = Number(
    payments
      .reduce((sum, item) => sum + normalizeMoney(item.amount), 0)
      .toFixed(2),
  );
  const balanceDue = Number(Math.max(0, amount - paidAmount).toFixed(2));

  let status = "Unpaid";
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
