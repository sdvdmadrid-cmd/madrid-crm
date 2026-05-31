import { stringifyEstimateNotes } from "./estimate-notes.js";
import { formatEstimateNumber, pickMaxEstimateSequence } from "./estimate-number.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeBuilderClientId(raw) {
  const value = String(raw || "").trim();
  return UUID_RE.test(value) ? value : null;
}

/**
 * Map estimate_builder `lines` JSON into pipeline `items` shape.
 */
export function mapBuilderLinesToEstimateItems(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line, index) => {
      const qty = Number(line?.qty ?? line?.quantity ?? 1);
      const unitPrice = Number(
        line?.finalPrice ?? line?.unitPrice ?? line?.price ?? line?.suggestedPrice ?? 0,
      );
      const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
      const safeUnit = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
      const price = Number((safeQty * safeUnit).toFixed(2));
      const name = String(line?.name || line?.description || line?.serviceName || "").trim();
      if (!name && price <= 0) return null;
      return {
        id: String(line?.id || line?.serviceId || `legacy-line-${index + 1}`),
        name: name || "Service",
        qty: safeQty,
        unitPrice: safeUnit,
        price,
      };
    })
    .filter(Boolean);
}

export function resolveBuilderStatus(row = {}) {
  if (row.last_sent_at) return "sent";
  return "draft";
}

export function buildNotesFromBuilderRow(row = {}, client = null) {
  const scopeParts = [
    String(row.description || "").trim(),
    String(row.notes || "").trim(),
  ].filter(Boolean);
  const noteText = scopeParts.join("\n\n");
  const audit = { sentAt: row.last_sent_at ? String(row.last_sent_at) : "" };
  const clientUuid = normalizeBuilderClientId(row.client_id);

  return stringifyEstimateNotes({
    address: String(client?.address || "").trim(),
    noteText: noteText
      ? `[Migrated from legacy Estimate Builder]\n\n${noteText}`
      : "[Migrated from legacy Estimate Builder]",
    clientUuid,
    clientEmail: String(client?.email || "").trim().toLowerCase(),
    clientPhone: String(client?.phone || "").trim(),
    audit,
  });
}

export function buildEstimateRowFromBuilder(row = {}, { client = null, estimateNumber } = {}) {
  const items = mapBuilderLinesToEstimateItems(row.lines);
  const subtotal = Number(
    row.total_final ?? row.total_mid ?? row.total_low ?? 0,
  );
  const safeSubtotal = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const tax = 0;
  const total = Number((safeSubtotal + tax).toFixed(2));

  return {
    tenant_id: row.tenant_id,
    user_id: row.user_id || null,
    created_by: row.created_by || null,
    // Live DB uses bigint client_id on estimates; legacy builder stores uuid text.
    client_id: null,
    client_name: String(row.name || client?.name || "Legacy estimate").trim() || "Legacy estimate",
    job_id: null,
    estimate_number: String(estimateNumber || row.estimate_number || "").trim(),
    status: resolveBuilderStatus(row),
    currency: "USD",
    items,
    subtotal: safeSubtotal,
    tax,
    total,
    notes: buildNotesFromBuilderRow(row, client),
    legacy_builder_id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

/**
 * Allocate EST-#### for tenants when legacy rows lack a number.
 */
export function nextNumberForTenant(existingNumbers, builderRowsForTenant) {
  const combined = [
    ...existingNumbers.map((n) => ({ estimate_number: n })),
    ...builderRowsForTenant.map((r) => ({ estimate_number: r.estimate_number })),
  ];
  return formatEstimateNumber(pickMaxEstimateSequence(combined) + 1);
}
