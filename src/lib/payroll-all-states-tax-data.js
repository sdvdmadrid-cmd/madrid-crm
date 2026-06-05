/**
 * 2026 approximate state income tax flat withholding rates (supplement to bracket tables).
 * Sources: state revenue department published marginal rates / employer guides.
 * Version: 2026-v2
 */

export const STATE_WITHHOLDING_FLAT_RATES_2026 = {
  AL: 0.05,
  AK: 0,
  AZ: 0.025,
  AR: 0.044,
  CA: 0, // bracket table
  CO: 0.044,
  CT: 0.05,
  DE: 0.052,
  FL: 0,
  GA: 0.0539,
  HI: 0.076,
  ID: 0.058,
  IL: 0.0495,
  IN: 0.0305,
  IA: 0.044,
  KS: 0.0525,
  KY: 0.04,
  LA: 0.0425,
  ME: 0.0715,
  MD: 0.0475,
  MA: 0.05,
  MI: 0.0425,
  MN: 0.0685,
  MS: 0.05,
  MO: 0.048,
  MT: 0.059,
  NE: 0.0584,
  NV: 0,
  NH: 0,
  NJ: 0.0637,
  NM: 0.049,
  NY: 0, // bracket table
  NC: 0.045,
  ND: 0.0195,
  OH: 0.035,
  OK: 0.0475,
  OR: 0.0875,
  PA: 0.0307,
  RI: 0.0599,
  SC: 0.064,
  SD: 0,
  TN: 0,
  TX: 0,
  UT: 0.0465,
  VT: 0.066,
  VA: 0.0575,
  WA: 0,
  WV: 0.0512,
  WI: 0.053,
  WY: 0,
};

/** States using progressive bracket tables instead of flat rate. */
export const STATE_BRACKET_STATES = new Set(["CA", "NY", "NJ", "OR", "VT", "IA", "MO", "NE"]);

export const LOCAL_TAX_SEEDS_2026 = {
  NYC: {
    jurisdiction: "US-NYC",
    city: "New York City",
    state: "NY",
    rate: 0.03078,
    wageBase: null,
  },
  YONKERS: {
    jurisdiction: "US-YON",
    city: "Yonkers",
    state: "NY",
    rate: 0.01659,
    wageBase: null,
  },
  PHILADELPHIA: {
    jurisdiction: "US-PHL",
    city: "Philadelphia",
    state: "PA",
    rate: 0.038,
    wageBase: null,
  },
  DETROIT: {
    jurisdiction: "US-DET",
    city: "Detroit",
    state: "MI",
    rate: 0.024,
    wageBase: null,
  },
};

/** Generate biweekly single approximate brackets from marginal rate. */
export function approximateBiweeklyBrackets(marginalRate) {
  const r = Number(marginalRate || 0.05);
  return [
    { max: 600, base: 0, over: 0, rate: r * 0.4 },
    { max: 2000, base: round2(600 * r * 0.4), over: 600, rate: r * 0.7 },
    { max: 5000, base: round2(600 * r * 0.4 + 1400 * r * 0.7), over: 2000, rate: r },
    { max: Infinity, base: round2(600 * r * 0.4 + 1400 * r * 0.7 + 3000 * r), over: 5000, rate: r * 1.1 },
  ];
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function allStateWithholdingBracketSeeds() {
  const seeds = {};
  for (const [state, rate] of Object.entries(STATE_WITHHOLDING_FLAT_RATES_2026)) {
    if (STATE_BRACKET_STATES.has(state) || rate === 0) continue;
    const brackets = approximateBiweeklyBrackets(rate);
    seeds[state] = {
      biweekly: {
        single: brackets,
        married: brackets,
        head_of_household: brackets,
      },
    };
  }
  return seeds;
}

export function allStateFlatRateMap() {
  return { ...STATE_WITHHOLDING_FLAT_RATES_2026 };
}
