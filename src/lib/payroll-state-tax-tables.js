/**
 * State tax table helpers — bracket lookup, flat rates, SUTA.
 * Split from payroll-tax-tables.js for state engine use.
 */

import { STATE_WITHHOLDING_FLAT_RATES_2026 } from "./payroll-all-states-tax-data.js";

const NO_INCOME_TAX_STATES = new Set([
  "AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY",
]);

export function defaultStateFlatRate(stateCode) {
  const code = String(stateCode || "").trim().toUpperCase();
  if (!code) return 0;
  if (code in STATE_WITHHOLDING_FLAT_RATES_2026) {
    return STATE_WITHHOLDING_FLAT_RATES_2026[code];
  }
  if (NO_INCOME_TAX_STATES.has(code)) return 0;
  return 0.05;
}

export function lookupBracketTable(wage, brackets = []) {
  const amount = Math.max(0, Number(wage || 0));
  for (const row of brackets) {
    const max = row.max === Infinity ? Infinity : Number(row.max);
    if (amount <= max) {
      const over = Number(row.over || 0);
      const base = Number(row.base || 0);
      const rate = Number(row.rate || 0);
      return Math.round((base + Math.max(0, amount - over) * rate) * 100) / 100;
    }
  }
  const last = brackets[brackets.length - 1];
  if (!last) return 0;
  return (
    Math.round(
      (Number(last.base || 0) +
        Math.max(0, amount - Number(last.over || 0)) * Number(last.rate || 0)) *
        100,
    ) / 100
  );
}

export function stateSutaRate(taxTables, stateCode) {
  const code = String(stateCode || "").trim().toUpperCase();
  if (!code) return { sutaRate: 0.027, wageBase: 7000 };
  const row = taxTables?.stateSutaRates?.[code];
  if (row) {
    return {
      sutaRate: Number(row.sutaRate ?? 0.027),
      wageBase: Number(row.wageBase ?? 7000),
    };
  }
  return { sutaRate: 0.027, wageBase: 7000 };
}

/** CA biweekly single approximate brackets (2026 estimate). */
export function defaultCaliforniaBiweeklySingleBrackets() {
  return [
    { max: 500, base: 0, over: 0, rate: 0.01 },
    { max: 1200, base: 5, over: 500, rate: 0.02 },
    { max: 2500, base: 19, over: 1200, rate: 0.04 },
    { max: 5000, base: 71, over: 2500, rate: 0.06 },
    { max: Infinity, base: 221, over: 5000, rate: 0.093 },
  ];
}

/** NY biweekly single approximate brackets (2026 estimate). */
export function defaultNewYorkBiweeklySingleBrackets() {
  return [
    { max: 400, base: 0, over: 0, rate: 0.04 },
    { max: 1500, base: 16, over: 400, rate: 0.045 },
    { max: 4000, base: 65.5, over: 1500, rate: 0.0525 },
    { max: Infinity, base: 196.75, over: 4000, rate: 0.0585 },
  ];
}

export function defaultStateWithholdingBracketSeeds() {
  const ca = defaultCaliforniaBiweeklySingleBrackets();
  const ny = defaultNewYorkBiweeklySingleBrackets();
  return {
    CA: {
      biweekly: { single: ca, married: ca, head_of_household: ca },
    },
    NY: {
      biweekly: { single: ny, married: ny, head_of_household: ny },
    },
  };
}

export function defaultStateEmployerTaxSeeds() {
  return {
    CA: { ettRate: 0.001, ettWageBase: 7000, trainingRate: 0 },
    NY: { trainingRate: 0.00075 },
    TX: {},
    FL: {},
  };
}

export function defaultStateEmployeeTaxSeeds() {
  return {
    CA: { sdiRate: 0.011, sdiWageBase: 153164 },
    NJ: { sdiRate: 0.0026, sdiWageBase: 156800 },
    NY: { sdiRate: 0.005, sdiWageBase: 12000 },
  };
}
