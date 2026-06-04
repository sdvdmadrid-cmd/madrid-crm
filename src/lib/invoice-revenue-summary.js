function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Aggregate invoice amounts from DB rows (amount, paid_amount, balance_due, status).
 */
export function summarizeInvoiceRevenue(rows = []) {
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalUnpaid = 0;
  let invoiceCount = 0;
  let paidCount = 0;
  let unpaidCount = 0;
  let partialCount = 0;
  let draftCount = 0;
  let overdueCount = 0;

  for (const row of rows) {
    const amount = roundMoney(row.amount);
    const paid = roundMoney(row.paid_amount ?? row.paidAmount);
    const balance = roundMoney(row.balance_due ?? row.balanceDue);
    const status = normalizeStatus(row.status);

    invoiceCount += 1;
    totalInvoiced += amount;
    totalPaid += paid;

    if (status === "draft") {
      draftCount += 1;
      continue;
    }

    const outstanding = balance > 0 ? balance : Math.max(0, amount - paid);

    if (status === "paid" || outstanding <= 0) {
      paidCount += 1;
    } else {
      unpaidCount += 1;
      totalUnpaid += outstanding;
    }

    if (status === "partial") partialCount += 1;
    if (status === "overdue" || status === "past due") overdueCount += 1;
  }

  return {
    totalInvoiced: roundMoney(totalInvoiced),
    totalPaid: roundMoney(totalPaid),
    totalUnpaid: roundMoney(totalUnpaid),
    counts: {
      invoiceCount,
      paidCount,
      unpaidCount,
      partialCount,
      draftCount,
      overdueCount,
    },
  };
}

export function summarizeInvoiceRevenueByTenant(rows = []) {
  const buckets = new Map();

  for (const row of rows) {
    const tenantId = String(row.tenant_id || row.tenantId || "unknown");
    if (!buckets.has(tenantId)) {
      buckets.set(tenantId, []);
    }
    buckets.get(tenantId).push(row);
  }

  return [...buckets.entries()]
    .map(([tenantId, tenantRows]) => ({
      tenantId,
      ...summarizeInvoiceRevenue(tenantRows),
    }))
    .sort((a, b) => b.totalUnpaid - a.totalUnpaid || b.totalPaid - a.totalPaid);
}
