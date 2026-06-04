/**
 * Invoice line item helpers (form, API, PDF, print).
 */

function toPositiveNumber(value, fallback = 0) {
  if (value === "" || value == null) return fallback;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value) {
  if (value === "" || value == null) return NaN;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function createInvoiceLineItem(id = "") {
  return {
    id: id || `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: "",
    label: "",
    details: "",
    quantity: 1,
    qty: 1,
    unitPrice: 0,
    amount: "",
    price: 0,
  };
}

export function getInvoiceLineItemDescription(item = {}) {
  return String(
    item.description || item.label || item.name || "",
  ).trim();
}

export function computeInvoiceLineItemTotal(item = {}) {
  const qtyRaw = item.quantity ?? item.qty ?? 1;
  const qty = toPositiveNumber(qtyRaw, 1);
  const safeQty = qty > 0 ? qty : 1;

  const unit = toOptionalNumber(item.unitPrice);
  if (Number.isFinite(unit) && unit >= 0) {
    return Number((safeQty * unit).toFixed(2));
  }

  const legacyAmount = toPositiveNumber(item.amount, NaN);
  if (Number.isFinite(legacyAmount) && legacyAmount >= 0) {
    return Number(legacyAmount.toFixed(2));
  }

  return 0;
}

export function normalizeInvoiceLineItem(raw = {}, index = 0) {
  const description =
    getInvoiceLineItemDescription(raw) ||
    String(raw.details || "").trim();
  const details = String(raw.details || "").trim();
  const quantity = toPositiveNumber(raw.quantity ?? raw.qty, 1);
  const safeQty = quantity > 0 ? quantity : 1;

  let unitPrice = toOptionalNumber(raw.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    const legacyLine = toPositiveNumber(raw.amount ?? raw.price, NaN);
    unitPrice =
      Number.isFinite(legacyLine) && legacyLine >= 0 && safeQty > 0
        ? legacyLine / safeQty
        : 0;
  }

  const lineTotal = Number((safeQty * unitPrice).toFixed(2));
  const id = String(raw.id || `line-${index + 1}`).trim() || `line-${index + 1}`;

  if (!description && lineTotal <= 0) {
    return null;
  }

  return {
    id,
    description: description || "Service",
    label: description || "Service",
    details,
    quantity: safeQty,
    qty: safeQty,
    unitPrice: Number(unitPrice.toFixed(2)),
    amount: lineTotal ? String(lineTotal) : "",
    price: lineTotal,
  };
}

export function normalizeInvoiceLineItemsForSave(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => normalizeInvoiceLineItem(item, index))
    .filter(Boolean);
}

export function normalizeInvoiceLineItemsForForm(items = []) {
  const normalized = normalizeInvoiceLineItemsForSave(items);
  if (normalized.length > 0) return normalized;
  return [createInvoiceLineItem("line-1")];
}

export function hasDisplayableInvoiceLineItems(items = []) {
  return normalizeInvoiceLineItemsForSave(items).length > 0;
}

export function sumInvoiceLineItemsTotals(items = []) {
  return normalizeInvoiceLineItemsForSave(items).reduce(
    (sum, item) => sum + computeInvoiceLineItemTotal(item),
    0,
  );
}

export function formatInvoiceLineItemsForList(items = []) {
  return normalizeInvoiceLineItemsForSave(items)
    .map((item) => {
      const total = computeInvoiceLineItemTotal(item);
      const qty = item.quantity ?? item.qty ?? 1;
      const unit = Number(item.unitPrice || 0);
      const left = [item.description, item.details].filter(Boolean).join(" — ");
      if (qty > 1 && unit > 0) {
        return `${left} (${qty} × $${unit.toFixed(2)}) — $${total.toFixed(2)}`;
      }
      return total > 0 ? `${left} — $${total.toFixed(2)}` : left;
    })
    .join("\n");
}
