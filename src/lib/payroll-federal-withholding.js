import { roundMoney } from "./payroll-money.js";
import { defaultFederalPub15TTables } from "./payroll-federal-pub15t-data.js";

function scheduleKey(payPeriodsPerYear) {
  if (payPeriodsPerYear === 52) return "weekly";
  if (payPeriodsPerYear === 24) return "semimonthly";
  if (payPeriodsPerYear === 12) return "monthly";
  return "biweekly";
}

function normalizeFilingStatus(status) {
  const s = String(status || "single").toLowerCase();
  if (s === "married" || s === "married_filing_jointly") return "married";
  if (s === "head_of_household" || s === "hoh") return "head_of_household";
  return "single";
}

function getPub15TBrackets(taxTables, payPeriodsPerYear, filingStatus) {
  const schedule = scheduleKey(payPeriodsPerYear);
  const status = normalizeFilingStatus(filingStatus);
  const pub = taxTables?.federalPub15T || defaultFederalPub15TTables();
  return pub.schedules?.[schedule]?.[status] || pub.schedules?.biweekly?.[status] || [];
}

/**
 * Percentage Method lookup per IRS Pub 15-T.
 */
export function lookupPercentageMethodTax(adjustedWage, brackets = []) {
  const wage = Math.max(0, Number(adjustedWage || 0));
  for (const row of brackets) {
    if (wage <= row.max) {
      const excess = Math.max(0, wage - row.over);
      return roundMoney(row.base + excess * row.rate);
    }
  }
  const last = brackets[brackets.length - 1];
  if (!last) return 0;
  return roundMoney(last.base + Math.max(0, wage - last.over) * last.rate);
}

/**
 * Adjust periodic wage per Form W-4 (2020+).
 */
export function adjustWageForW4(grossPay, w4Data = {}, payPeriodsPerYear = 26) {
  const periods = Math.max(1, Number(payPeriodsPerYear || 26));
  let wage = Number(grossPay || 0);

  wage += Number(w4Data.otherIncome || w4Data.other_income || 0) / periods;
  wage -= Number(w4Data.deductions || w4Data.step4Deductions || 0) / periods;
  wage -= Number(w4Data.dependentsCredit || w4Data.dependents_credit || 0) / periods;

  if (w4Data.multipleJobs || w4Data.multiple_jobs) {
    wage *= 1.05;
  }

  return roundMoney(Math.max(0, wage));
}

/**
 * Calculate federal income tax withholding using Pub 15-T Percentage Method.
 */
export function calculateFederalWithholdingPub15T({
  grossPay,
  payPeriodsPerYear = 26,
  filingStatus = "single",
  w4Data = {},
  w4ExtraWithholding = 0,
  federalExempt = false,
  taxTables = {},
  isCorrection = false,
}) {
  if (federalExempt) return 0;

  const adjustedWage = adjustWageForW4(grossPay, w4Data, payPeriodsPerYear);
  const brackets = getPub15TBrackets(taxTables, payPeriodsPerYear, filingStatus);
  let withholding = lookupPercentageMethodTax(adjustedWage, brackets);

  withholding += roundMoney(Number(w4ExtraWithholding || 0) / Math.max(1, payPeriodsPerYear));

  if (isCorrection) return roundMoney(withholding);

  return roundMoney(Math.max(0, withholding));
}
