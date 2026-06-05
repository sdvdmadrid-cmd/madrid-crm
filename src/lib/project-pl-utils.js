import { roundMoney } from "./payroll-money.js";

function parseMoney(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Extract estimated labor/materials/revenue from AI estimate snapshot or job price. */
export function extractJobEstimateBreakdown(job = {}) {
  const snap = job.estimate_snapshot || job.estimateSnapshot || null;
  const quotedPrice = parseMoney(job.price);

  if (!snap || typeof snap !== "object") {
    return {
      estimatedHours: 0,
      estimatedLaborCost: 0,
      estimatedMaterialsCost: 0,
      estimatedRevenue: quotedPrice,
      laborRate: 0,
    };
  }

  const laborLine = (snap.lineItems || []).find((row) =>
    /labor|mano|obra|work/i.test(String(row?.label || "")),
  );
  const materialsLine = (snap.lineItems || []).find((row) =>
    /material|materiales|supplies/i.test(String(row?.label || "")),
  );

  const estimatedHours = Number(snap.estimatedHours || 0);
  const laborRate = Number(snap.laborRate || 0);
  const estimatedLaborCost =
    Number(laborLine?.amount ?? 0) ||
    roundMoney(estimatedHours * laborRate);
  const estimatedMaterialsCost = Number(materialsLine?.amount ?? 0);
  const estimatedRevenue =
    Number(snap.recommendedPrice || 0) || quotedPrice;

  return {
    estimatedHours,
    estimatedLaborCost: roundMoney(estimatedLaborCost),
    estimatedMaterialsCost: roundMoney(estimatedMaterialsCost),
    estimatedRevenue: roundMoney(estimatedRevenue),
    laborRate,
  };
}

export function invoiceAmount(inv = {}) {
  const amount = parseMoney(inv.amount);
  if (amount > 0) return amount;
  const cents = Number(inv.total_cents || 0);
  if (cents > 0) return roundMoney(cents / 100);
  return parseMoney(inv.total);
}

export function invoicePaidDate(inv = {}) {
  const status = String(inv.status || "").toLowerCase();
  if (inv.stripe_last_payment_at) {
    return String(inv.stripe_last_payment_at).slice(0, 10);
  }
  if (status === "paid" && inv.updated_at) {
    return String(inv.updated_at).slice(0, 10);
  }
  if (inv.paid_at) return String(inv.paid_at).slice(0, 10);
  return null;
}

export function isInvoicePaid(inv = {}) {
  const status = String(inv.status || "").toLowerCase();
  return status === "paid" || Boolean(invoicePaidDate(inv));
}

export function summarizeInvoices(invoices = []) {
  let invoicedTotal = 0;
  let paidTotal = 0;
  let openTotal = 0;

  for (const inv of invoices) {
    const total = invoiceAmount(inv);
    invoicedTotal += total;
    if (isInvoicePaid(inv)) {
      paidTotal += total;
    } else {
      openTotal += Number(inv.balance_due ?? total);
    }
  }

  return {
    invoiceCount: invoices.length,
    invoicedTotal: roundMoney(invoicedTotal),
    paidTotal: roundMoney(paidTotal),
    openTotal: roundMoney(openTotal),
  };
}

export function computeProjectProfit({
  revenue,
  laborBurden = 0,
  materialsCost = 0,
  equipmentCost = 0,
  subcontractorCost = 0,
  otherCosts = 0,
}) {
  const totalCosts = roundMoney(
    laborBurden + materialsCost + equipmentCost + subcontractorCost + otherCosts,
  );
  const grossProfit = roundMoney(revenue - totalCosts);
  const marginPercent =
    revenue > 0 ? roundMoney((grossProfit / revenue) * 100) : 0;
  return {
    totalCosts,
    grossProfit,
    marginPercent,
    profitAfterLabor: roundMoney(revenue - laborBurden),
    netProfit: grossProfit,
  };
}

export function buildCostComparison(estimate = {}, actual = {}) {
  const rows = [
    { key: "labor", label: "Labor", estimated: estimate.laborCost ?? 0, actual: actual.laborBurden ?? 0 },
    { key: "materials", label: "Materials", estimated: estimate.materialsCost ?? 0, actual: actual.materialsCost ?? 0 },
    { key: "equipment", label: "Equipment", estimated: estimate.equipmentCost ?? 0, actual: actual.equipmentCost ?? 0 },
    { key: "subcontractor", label: "Subcontractors", estimated: estimate.subcontractorCost ?? 0, actual: actual.subcontractorCost ?? 0 },
    { key: "other", label: "Other", estimated: estimate.otherCost ?? 0, actual: actual.otherCost ?? 0 },
  ];

  return rows.map((row) => ({
    ...row,
    variance: roundMoney(Number(row.actual) - Number(row.estimated)),
    variancePercent:
      Number(row.estimated) > 0
        ? roundMoney(((Number(row.actual) - Number(row.estimated)) / Number(row.estimated)) * 100)
        : 0,
  }));
}
