import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculatePayrollRunItem } from "../../src/lib/payroll-calculator.js";
import { defaultFederalTables } from "../../src/lib/payroll-tax-tables.js";
import {
  applyEmployeeSettingsDefaults,
  mergeTaxTablesWithSettings,
  overtimeHoursThresholdForPeriod,
  resolveRunItemHours,
  suggestedPayRunFromSettings,
  taxTablesForEmployee,
} from "../../src/lib/payroll-settings-utils.js";

describe("payroll-settings-service", () => {
  it("auto-splits overtime from standard weekly hours and pay frequency", () => {
    assert.equal(overtimeHoursThresholdForPeriod(40, "biweekly"), 80);
    const resolved = resolveRunItemHours({
      hoursRegular: 90,
      hoursOvertime: 0,
      standardWeeklyHours: 40,
      scheduleType: "biweekly",
    });
    assert.equal(resolved.hoursRegular, 80);
    assert.equal(resolved.hoursOvertime, 10);
    assert.equal(resolved.autoSplitApplied, true);
  });

  it("preserves manually entered overtime hours", () => {
    const resolved = resolveRunItemHours({
      hoursRegular: 40,
      hoursOvertime: 5,
      standardWeeklyHours: 40,
      scheduleType: "biweekly",
    });
    assert.equal(resolved.hoursRegular, 40);
    assert.equal(resolved.hoursOvertime, 5);
    assert.equal(resolved.autoSplitApplied, false);
  });

  it("applies tenant default work state when employee is missing one", () => {
    const employee = applyEmployeeSettingsDefaults(
      { firstName: "Sam", workState: "" },
      { defaultWorkState: "TX" },
    );
    assert.equal(employee.workState, "TX");
  });

  it("merges tenant FUTA and work-state SUTA into tax tables", () => {
    const base = defaultFederalTables();
    const merged = taxTablesForEmployee(
      base,
      { futaRate: 0.008, sutaRate: 0.031, defaultWorkState: "TX" },
      { workState: "TX" },
    );
    assert.equal(merged.futa.rate, 0.008);
    assert.equal(merged.stateSutaRates.TX.sutaRate, 0.031);
  });

  it("uses pay schedule for salary gross per period", () => {
    const monthly = calculatePayrollRunItem({
      employee: {
        taxForm: "w2",
        payType: "salary",
        annualSalary: 12000,
        filingStatus: "single",
        workState: "TX",
      },
      taxTables: {
        ...defaultFederalTables(),
        stateFlatRates: { TX: 0 },
      },
      payPeriodsPerYear: 12,
    });
    assert.equal(monthly.grossPay, 1000);
  });

  it("builds suggested pay run dates from tenant settings", () => {
    const suggested = suggestedPayRunFromSettings({
      defaultPaySchedule: "biweekly",
      payWeekStartDay: 1,
      standardWeeklyHours: 32,
    });
    assert.ok(suggested.periodStart);
    assert.ok(suggested.periodEnd);
    assert.ok(suggested.payDate);
    assert.equal(suggested.scheduleType, "biweekly");
    assert.equal(suggested.standardWeeklyHours, 32);
  });

  it("keeps tenant tax table merge isolated per settings object", () => {
    const tenantA = mergeTaxTablesWithSettings(defaultFederalTables(), {
      futaRate: 0.007,
    });
    const tenantB = mergeTaxTablesWithSettings(defaultFederalTables(), {
      futaRate: 0.009,
    });
    assert.equal(tenantA.futa.rate, 0.007);
    assert.equal(tenantB.futa.rate, 0.009);
  });
});
