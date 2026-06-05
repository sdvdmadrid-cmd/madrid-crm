import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  calculatePayrollRunItem,
  summarizePayrollRunItems,
} from "../../src/lib/payroll-calculator.js";
import { defaultFederalTables } from "../../src/lib/payroll-tax-tables.js";

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const taxTables = {
  ...defaultFederalTables(),
  stateFlatRates: Object.fromEntries(STATES.map((s) => [s, 0.05])),
};

describe("payroll stress — 500 employees", () => {
  it("calculates 500 paychecks across all states under 3 seconds", () => {
    const start = performance.now();
    const items = [];

    for (let i = 0; i < 500; i += 1) {
      const state = STATES[i % STATES.length];
      const is1099 = i % 20 === 0;
      const result = calculatePayrollRunItem({
        employee: {
          taxForm: is1099 ? "1099" : "w2",
          payType: "hourly",
          hourlyRate: 20 + (i % 30),
          filingStatus: i % 3 === 0 ? "married" : "single",
          workState: state,
          addressState: state,
        },
        hoursRegular: 40 + (i % 10),
        hoursOvertime: i % 7 === 0 ? 4 : 0,
        taxTables,
        scheduleType: i % 2 === 0 ? "biweekly" : "weekly",
      });
      items.push(result);
      assert.ok(result.grossPay > 0);
      assert.ok(result.netPay >= 0);
      if (is1099) assert.equal(result.deductions.totalEmployeeTaxes, 0);
    }

    const totals = summarizePayrollRunItems(items);
    const elapsed = performance.now() - start;

    assert.equal(totals.employeeCount, 500);
    assert.ok(totals.grossPay > 0);
    assert.ok(elapsed < 3000, `Expected <3s, got ${elapsed.toFixed(0)}ms`);
  });
});
