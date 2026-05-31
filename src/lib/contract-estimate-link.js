const ESTIMATE_REF_PREFIX = "est-ref:";

export function resolveContractEstimateId(doc) {
  const direct = String(doc?.estimate_id || "").trim();
  if (direct) return direct;
  const invoiceNumber = String(doc?.invoice_number || "").trim();
  if (invoiceNumber.startsWith(ESTIMATE_REF_PREFIX)) {
    return invoiceNumber.slice(ESTIMATE_REF_PREFIX.length);
  }
  return "";
}

export function estimateRefInvoiceNumber(estimateId) {
  const id = String(estimateId || "").trim();
  return id ? `${ESTIMATE_REF_PREFIX}${id}` : "";
}

export function isMissingEstimateIdColumnError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("estimate_id") &&
    (msg.includes("column") || msg.includes("schema cache"))
  );
}
