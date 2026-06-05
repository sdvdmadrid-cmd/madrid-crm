/**
 * Versioned payroll tax reference data. Pure helpers for unit tests;
 * server loaders live in payroll-tax-tables-server.js.
 */

import { defaultFederalPub15TTables } from "./payroll-federal-pub15t-data.js";
import {
  allStateFlatRateMap,
  allStateWithholdingBracketSeeds,
  LOCAL_TAX_SEEDS_2026,
} from "./payroll-all-states-tax-data.js";
import {
  defaultStateEmployeeTaxSeeds,
  defaultStateEmployerTaxSeeds,
  defaultStateFlatRate,
  defaultStateWithholdingBracketSeeds,
  stateSutaRate,
} from "./payroll-state-tax-tables.js";

export { defaultStateFlatRate, stateSutaRate };

export function jurisdictionForState(stateCode) {
  const code = String(stateCode || "")
    .trim()
    .toUpperCase();
  return code ? `US-${code}` : "US-FED";
}

export function defaultFederalTables() {
  const bracketSeeds = {
    ...allStateWithholdingBracketSeeds(),
    ...defaultStateWithholdingBracketSeeds(),
  };
  const localTaxRates = {};
  for (const row of Object.values(LOCAL_TAX_SEEDS_2026)) {
    if (!localTaxRates[row.state]) localTaxRates[row.state] = {};
    localTaxRates[row.state][row.jurisdiction] = row;
  }

  return {
    versionLabel: "2026-v2",
    federalPub15T: defaultFederalPub15TTables(),
    fica: {
      socialSecurityRate: 0.062,
      medicareRate: 0.0145,
      additionalMedicareRate: 0.009,
      socialSecurityWageBase: 184500,
      additionalMedicareThreshold: 200000,
    },
    futa: {
      rate: 0.006,
      wageBase: 7000,
    },
    stateFlatRates: allStateFlatRateMap(),
    stateWithholdingBrackets: bracketSeeds,
    stateEmployerTaxes: defaultStateEmployerTaxSeeds(),
    stateEmployeeTaxes: defaultStateEmployeeTaxSeeds(),
    localTaxRates,
  };
}

export function mergeTaxTablesFromRows(rows = []) {
  const defaults = defaultFederalTables();
  const out = {
    versionLabel: "",
    federalPub15T: defaults.federalPub15T,
    fica: { ...defaults.fica },
    futa: { ...defaults.futa },
    stateFlatRates: {},
    stateSutaRates: {},
    stateWithholdingBrackets: { ...defaults.stateWithholdingBrackets },
    stateEmployerTaxes: { ...defaults.stateEmployerTaxes },
    stateEmployeeTaxes: { ...defaults.stateEmployeeTaxes },
    localTaxRates: { ...defaults.localTaxRates },
  };

  for (const row of rows) {
    out.versionLabel = row.version_label || out.versionLabel;
    const payload = row.payload || {};
    const state = String(row.jurisdiction || "").replace(/^US-/, "");

    if (row.table_type === "federal_pub15t") {
      out.federalPub15T = { ...out.federalPub15T, ...payload };
    } else if (row.table_type === "fica") {
      out.fica = { ...out.fica, ...payload };
    } else if (row.table_type === "futa") {
      out.futa = { ...out.futa, ...payload };
    } else if (row.table_type === "state_withholding") {
      if (state) out.stateFlatRates[state] = Number(payload.flatRate ?? 0);
    } else if (row.table_type === "state_withholding_brackets") {
      if (state) {
        out.stateWithholdingBrackets[state] = payload.schedules || payload;
      }
    } else if (row.table_type === "state_suta") {
      if (state) {
        out.stateSutaRates[state] = {
          sutaRate: Number(payload.sutaRate ?? 0.027),
          wageBase: Number(payload.wageBase ?? 7000),
        };
      }
    } else if (row.table_type === "state_employer") {
      if (state) out.stateEmployerTaxes[state] = payload;
    } else if (row.table_type === "state_employee") {
      if (state) out.stateEmployeeTaxes[state] = payload;
    } else if (row.table_type === "local_tax") {
      if (state) out.localTaxRates[state] = payload.rates || payload;
    }
  }

  return out;
}

/** @deprecated Use calculateStateWithholding from payroll-state-tax-engine.js */
export function stateWithholdingRate(taxTables, stateCode) {
  const code = String(stateCode || "")
    .trim()
    .toUpperCase();
  if (!code) return 0;
  if (taxTables?.stateFlatRates && code in taxTables.stateFlatRates) {
    return Number(taxTables.stateFlatRates[code] || 0);
  }
  return defaultStateFlatRate(code);
}
