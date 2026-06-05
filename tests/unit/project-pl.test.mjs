import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeProjectProfit,
  extractJobEstimateBreakdown,
  summarizeInvoices,
} from "../../src/lib/project-pl-utils.js";

describe("project-pl-utils", () => {
  it("extracts estimated labor from estimate snapshot", () => {
    const breakdown = extractJobEstimateBreakdown({
      price: "5000",
      estimateSnapshot: {
        recommendedPrice: 5200,
        estimatedHours: 40,
        laborRate: 25,
        lineItems: [
          { label: "Labor", amount: 1000 },
          { label: "Materials", amount: 800 },
        ],
      },
    });

    assert.equal(breakdown.estimatedHours, 40);
    assert.equal(breakdown.estimatedLaborCost, 1000);
    assert.equal(breakdown.estimatedMaterialsCost, 800);
    assert.equal(breakdown.estimatedRevenue, 5200);
  });

  it("summarizes paid vs open invoices", () => {
    const summary = summarizeInvoices([
      { total: 1000, status: "paid", paid_at: "2026-05-01" },
      { total: 500, status: "open" },
    ]);
    assert.equal(summary.paidTotal, 1000);
    assert.equal(summary.openTotal, 500);
    assert.equal(summary.invoicedTotal, 1500);
  });

  it("computes project profit with labor burden", () => {
    const profit = computeProjectProfit({
      revenue: 10000,
      laborBurden: 3500,
      materialsCost: 1200,
      equipmentCost: 300,
      subcontractorCost: 800,
      otherCosts: 200,
    });
    assert.equal(profit.totalCosts, 6000);
    assert.equal(profit.grossProfit, 4000);
    assert.equal(profit.marginPercent, 40);
    assert.equal(profit.profitAfterLabor, 6500);
  });
});
