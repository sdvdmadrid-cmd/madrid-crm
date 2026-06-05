import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayrollRunItem,
  summarizePayrollRunItems,
} from "../../src/lib/payroll-calculator.js";
import {
  defaultFederalTables,
  stateSutaRate,
  stateWithholdingRate,
} from "../../src/lib/payroll-tax-tables.js";
import { buildAchFileContent } from "../../src/lib/payroll-ach-export.js";
import { aggregateTimeForPayRun } from "../../src/lib/payroll-time-utils.js";

const taxTables = {
  ...defaultFederalTables(),
  stateFlatRates: { TX: 0, CA: 0.05, NY: 0.05 },
  stateSutaRates: {
    TX: { sutaRate: 0.031, wageBase: 7000 },
    CA: { sutaRate: 0.034, wageBase: 7000 },
  },
};

describe("payroll-calculator production scenarios", () => {
  it("W-2 Jorge 7×$25 TX", () => {
    const result = calculatePayrollRunItem({
      employee: {
        taxForm: "w2",
        payType: "hourly",
        hourlyRate: 25,
        filingStatus: "single",
        workState: "TX",
      },
      hoursRegular: 7,
      taxTables,
    });
    assert.equal(result.grossPay, 175);
    assert.equal(result.netPay, 161.61);
  });

  it("overtime at 1.5× rate", () => {
    const result = calculatePayrollRunItem({
      employee: { taxForm: "w2", payType: "hourly", hourlyRate: 20, workState: "TX" },
      hoursRegular: 40,
      hoursOvertime: 5,
      taxTables,
    });
    assert.equal(result.grossPay, 950);
    assert.ok(result.netPay < result.grossPay);
  });

  it("California employee with state withholding", () => {
    const result = calculatePayrollRunItem({
      employee: {
        taxForm: "w2",
        payType: "hourly",
        hourlyRate: 30,
        filingStatus: "single",
        workState: "CA",
      },
      hoursRegular: 8,
      taxTables,
    });
    assert.equal(result.grossPay, 240);
    assert.equal(result.deductions.stateWithholding, 2.4);
    assert.ok(stateWithholdingRate(taxTables, "CA") === 0.05);
  });

  it("federal and state exempt employee", () => {
    const result = calculatePayrollRunItem({
      employee: {
        taxForm: "w2",
        hourlyRate: 25,
        workState: "CA",
        federalExempt: true,
        stateExempt: true,
      },
      hoursRegular: 8,
      taxTables,
    });
    assert.equal(result.deductions.federalWithholding, 0);
    assert.equal(result.deductions.stateWithholding, 0);
    assert.ok(result.deductions.socialSecurity > 0);
  });

  it("employer SUTA uses state-specific rate", () => {
    const result = calculatePayrollRunItem({
      employee: { taxForm: "w2", hourlyRate: 25, workState: "TX" },
      hoursRegular: 40,
      taxTables,
    });
    const suta = stateSutaRate(taxTables, "TX");
    assert.equal(suta.sutaRate, 0.031);
    assert.ok(result.employerTaxes.suta > 0);
  });

  it("1099 contractor — no withholding", () => {
    const result = calculatePayrollRunItem({
      employee: { taxForm: "1099", hourlyRate: 50, workState: "NY" },
      hoursRegular: 10,
      taxTables,
    });
    assert.equal(result.grossPay, 500);
    assert.equal(result.netPay, 500);
  });

  it("summarizes multiple pay periods", () => {
    const totals = summarizePayrollRunItems([
      { grossPay: 175, netPay: 161.61, deductions: {}, employerTaxes: { total: 20 } },
      { grossPay: 800, netPay: 620, deductions: {}, employerTaxes: { total: 80 } },
    ]);
    assert.equal(totals.grossPay, 975);
    assert.equal(totals.netPay, 781.61);
    assert.equal(totals.employeeCount, 2);
  });
});

describe("payroll ACH export", () => {
  it("builds NACHA-style file with entries", () => {
    const content = buildAchFileContent({
      companyName: "Madrid Landscaping",
      companyId: "123456789",
      effectiveDate: "2026-06-15",
      entries: [
        {
          name: "Jorge Garcia",
          routingNumber: "111000025",
          accountNumber: "123456789",
          amount: 161.61,
        },
      ],
    });
    assert.match(content, /^101 /m);
    assert.match(content, /^5200/m);
    assert.match(content, /^622/m);
    assert.match(content, /^8200/m);
    assert.match(content, /^9000001/m);
  });
});

describe("payroll time aggregation", () => {
  it("aggregates regular, overtime, pto, and sick", () => {
    const totals = aggregateTimeForPayRun([
      { entryType: "regular", hours: 8 },
      { entryType: "overtime", hours: 2 },
      { entryType: "pto", hours: 4 },
      { entryType: "sick", hours: 1 },
    ]);
    assert.equal(totals.hoursRegular, 8);
    assert.equal(totals.hoursOvertime, 2);
    assert.equal(totals.ptoHours, 4);
    assert.equal(totals.sickHours, 1);
  });
});
