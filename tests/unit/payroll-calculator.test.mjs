import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayrollRunItem,
  summarizePayrollRunItems,
} from "../../src/lib/payroll-calculator.js";
import { defaultFederalTables } from "../../src/lib/payroll-tax-tables.js";

describe("payroll-calculator", () => {
  it("calculates Jorge at 7 hours × $25/hr in Texas (W-2)", () => {
    const taxTables = {
      ...defaultFederalTables(),
      stateFlatRates: { TX: 0 },
    };

    const result = calculatePayrollRunItem({
      employee: {
        firstName: "Jorge",
        taxForm: "w2",
        payType: "hourly",
        hourlyRate: 25,
        filingStatus: "single",
        workState: "TX",
        addressState: "TX",
      },
      hoursRegular: 7,
      hoursOvertime: 0,
      taxTables,
      ytdBefore: {},
    });

    assert.equal(result.grossPay, 175);
    assert.equal(result.deductions.federalWithholding, 0);
    assert.equal(result.deductions.stateWithholding, 0);
    assert.equal(result.deductions.socialSecurity, 10.85);
    assert.equal(result.deductions.medicare, 2.54);
    assert.equal(result.netPay, 161.61);
    assert.equal(result.employerTaxes.socialSecurity, 10.85);
    assert.ok(result.employerTaxes.total > 0);
  });

  it("1099 contractors receive gross pay with no withholding", () => {
    const result = calculatePayrollRunItem({
      employee: {
        taxForm: "1099",
        payType: "hourly",
        hourlyRate: 50,
        workState: "CA",
      },
      hoursRegular: 10,
      taxTables: defaultFederalTables(),
    });

    assert.equal(result.grossPay, 500);
    assert.equal(result.deductions.federalWithholding, 0);
    assert.equal(result.deductions.totalEmployeeTaxes, 0);
    assert.equal(result.netPay, 500);
  });

  it("summarizes multiple pay run lines", () => {
    const totals = summarizePayrollRunItems([
      {
        grossPay: 175,
        netPay: 161.61,
        deductions: {
          federalWithholding: 0,
          stateWithholding: 0,
          socialSecurity: 10.85,
          medicare: 2.54,
          additional: 0,
        },
        employerTaxes: { total: 20 },
      },
      {
        grossPay: 100,
        netPay: 80,
        deductions: {
          federalWithholding: 12,
          stateWithholding: 5,
          socialSecurity: 6.2,
          medicare: 1.45,
          additional: 0,
        },
        employerTaxes: { total: 10 },
      },
    ]);

    assert.equal(totals.grossPay, 275);
    assert.equal(totals.netPay, 241.61);
    assert.equal(totals.federalWithholding, 12);
    assert.equal(totals.employeeCount, 2);
    assert.equal(totals.employerTaxes, 30);
  });
});
