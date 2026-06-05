import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractAmountFromReceiptText,
  summarizeExpensesByCategory,
} from "../../src/lib/job-expense-utils.js";
import { buildCostComparison } from "../../src/lib/project-pl-utils.js";

describe("job-expense-service", () => {
  it("summarizes expenses by category", () => {
    const summary = summarizeExpensesByCategory([
      { category: "material", amount: 100 },
      { category: "vendor", amount: 50 },
      { category: "fuel", amount: 25 },
    ]);
    assert.equal(summary.byCategory.material, 100);
    assert.equal(summary.byCategory.vendor, 50);
    assert.equal(summary.byCategory.fuel, 25);
    assert.equal(summary.total, 175);
  });

  it("extracts amount from receipt text (OCR stub)", () => {
    const amount = extractAmountFromReceiptText("Home Depot receipt total $142.37 tax included");
    assert.equal(amount, 142.37);
  });
});

describe("project-pl cost comparison", () => {
  it("builds estimated vs actual rows with variance", () => {
    const rows = buildCostComparison(
      { laborCost: 1000, materialsCost: 500, equipmentCost: 0, subcontractorCost: 0, otherCost: 0 },
      { laborBurden: 1200, materialsCost: 450, equipmentCost: 200, subcontractorCost: 300, otherCost: 50 },
    );
    assert.equal(rows.length, 5);
    assert.equal(rows[0].variance, 200);
    assert.equal(rows[1].variance, -50);
  });
});
