import { roundMoney } from "./payroll-money.js";
import {
  defaultStateFlatRate,
  lookupBracketTable,
  stateSutaRate,
} from "./payroll-state-tax-tables.js";

const NO_INCOME_TAX_STATES = new Set([
  "AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY",
]);

/** Known local income tax jurisdictions (flat rate on gross). Expand via DB. */
const DEFAULT_LOCAL_TAX_RATES = {
  "US-NY-NYC": 0.03078,
  "US-PA-PHL": 0.0383,
  "US-OH-COL": 0.025,
  "US-MI-DET": 0.024,
};

function localTaxKey(state, city) {
  const s = String(state || "").trim().toUpperCase();
  const c = String(city || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  if (!s || !c) return "";
  return `US-${s}-${c}`;
}

function getStateWithholdingBrackets(taxTables, stateCode, schedule, filingStatus) {
  const code = String(stateCode || "").trim().toUpperCase();
  const brackets =
    taxTables?.stateWithholdingBrackets?.[code]?.[schedule]?.[filingStatus] ||
    taxTables?.stateWithholdingBrackets?.[code]?.biweekly?.[filingStatus];
  return brackets || null;
}

function scheduleFromPeriods(payPeriodsPerYear) {
  if (payPeriodsPerYear === 52) return "weekly";
  if (payPeriodsPerYear === 24) return "semimonthly";
  if (payPeriodsPerYear === 12) return "monthly";
  return "biweekly";
}

/**
 * State income tax withholding — bracket tables when available, else flat rate.
 */
export function calculateStateWithholding({
  grossPay,
  workState,
  filingStatus = "single",
  stateExempt = false,
  stateExtraWithholding = 0,
  payPeriodsPerYear = 26,
  taxTables = {},
  w4Data = {},
}) {
  if (stateExempt) return 0;

  const code = String(workState || "").trim().toUpperCase();
  if (!code || NO_INCOME_TAX_STATES.has(code)) {
    return roundMoney(Number(stateExtraWithholding || 0) / Math.max(1, payPeriodsPerYear));
  }

  const schedule = scheduleFromPeriods(payPeriodsPerYear);
  const brackets = getStateWithholdingBrackets(taxTables, code, schedule, filingStatus);

  let withholding = 0;
  if (brackets?.length) {
    const adjusted = roundMoney(
      Number(grossPay || 0) -
        Number(w4Data.stateAllowances || 0) / Math.max(1, payPeriodsPerYear),
    );
    withholding = lookupBracketTable(Math.max(0, adjusted), brackets);
  } else {
    const flatRate =
      taxTables?.stateFlatRates?.[code] ?? defaultStateFlatRate(code);
    withholding = roundMoney(Number(grossPay || 0) * Number(flatRate || 0));
  }

  withholding += roundMoney(
    Number(stateExtraWithholding || 0) / Math.max(1, payPeriodsPerYear),
  );

  return roundMoney(Math.max(0, withholding));
}

/**
 * Local income tax (employee) where applicable.
 */
export function calculateLocalWithholding({
  grossPay,
  workState,
  workCity,
  taxTables = {},
  localExempt = false,
}) {
  if (localExempt) return 0;

  const key = localTaxKey(workState, workCity);
  const localRates = { ...DEFAULT_LOCAL_TAX_RATES, ...(taxTables.localTaxRates || {}) };
  const rate = key ? Number(localRates[key] || 0) : 0;
  if (!rate) return 0;
  return roundMoney(Number(grossPay || 0) * rate);
}

/**
 * State employee payroll taxes (e.g. CA SDI, NJ UI/SDI).
 */
export function calculateStateEmployeeTaxes({
  grossPay,
  workState,
  ytdGrossBefore = 0,
  taxTables = {},
}) {
  const code = String(workState || "").trim().toUpperCase();
  const config = taxTables?.stateEmployeeTaxes?.[code] || {};
  const taxes = {};

  if (config.sdiRate) {
    const wageBase = Number(config.sdiWageBase ?? Infinity);
    const remaining = Math.max(0, wageBase - ytdGrossBefore);
    const taxable = Math.min(Number(grossPay || 0), remaining);
    taxes.stateDisability = roundMoney(taxable * Number(config.sdiRate));
  }

  return taxes;
}

/**
 * State employer payroll taxes beyond SUTA (e.g. state training tax, ETT).
 */
export function calculateStateEmployerTaxes({
  grossPay,
  workState,
  ytdGrossBefore = 0,
  taxTables = {},
}) {
  const code = String(workState || "").trim().toUpperCase();
  const suta = stateSutaRate(taxTables, code);
  const sutaRemaining = Math.max(0, suta.wageBase - ytdGrossBefore);
  const sutaTaxable = Math.min(Number(grossPay || 0), sutaRemaining);
  const sutaTax = roundMoney(sutaTaxable * suta.sutaRate);

  const config = taxTables?.stateEmployerTaxes?.[code] || {};
  let extra = 0;

  if (config.trainingRate) {
    extra += roundMoney(Number(grossPay || 0) * Number(config.trainingRate));
  }
  if (config.ettRate) {
    const ettBase = Number(config.ettWageBase ?? 7000);
    const ettRemaining = Math.max(0, ettBase - ytdGrossBefore);
    extra += roundMoney(
      Math.min(Number(grossPay || 0), ettRemaining) * Number(config.ettRate),
    );
  }

  return {
    suta: sutaTax,
    training: roundMoney(extra),
    total: roundMoney(sutaTax + extra),
  };
}
