/**
 * IRS Publication 15-T Percentage Method tables (2026 estimates).
 * Structure: bracket rows with cumulative base tax, wage floor, and marginal rate.
 * Used when DB seed is unavailable (tests, fallback).
 */

function brackets(rows) {
  return rows.map(([max, base, over, rate]) => ({ max, base, over, rate }));
}

/** Biweekly percentage method — Single or Married filing separately */
export const PUB15T_2026_BIWEEKLY_SINGLE = brackets([
  [260, 0, 0, 0],
  [844, 0, 260, 0.1],
  [2644, 58.4, 844, 0.12],
  [5021, 274.4, 2644, 0.22],
  [9387, 797.34, 5021, 0.24],
  [11859, 1255.18, 9387, 0.32],
  [29352, 10426.66, 11859, 0.35],
  [Infinity, 16551.21, 29352, 0.37],
]);

/** Biweekly — Married filing jointly or Qualifying surviving spouse */
export const PUB15T_2026_BIWEEKLY_MARRIED = brackets([
  [980, 0, 0, 0],
  [1688, 0, 980, 0.1],
  [3954, 70.8, 1688, 0.12],
  [7604, 342.72, 3954, 0.22],
  [13713, 1144.72, 7604, 0.24],
  [17288, 2011.88, 13713, 0.32],
  [42658, 11497.48, 17288, 0.35],
  [Infinity, 20361.98, 42658, 0.37],
]);

/** Biweekly — Head of household */
export const PUB15T_2026_BIWEEKLY_HOH = brackets([
  [520, 0, 0, 0],
  [1265, 0, 520, 0.1],
  [3173, 74.5, 1265, 0.12],
  [5912, 303.46, 3173, 0.22],
  [10454, 906.04, 5912, 0.24],
  [13048, 1996.12, 10454, 0.32],
  [32315, 2826.2, 13048, 0.35],
  [Infinity, 9570.65, 32315, 0.37],
]);

function scaleBrackets(source, factor) {
  return source.map((row) => ({
    max: row.max === Infinity ? Infinity : row.max * factor,
    base: row.base * factor,
    over: row.over * factor,
    rate: row.rate,
  }));
}

/** Weekly = biweekly / 2 (Pub 15-T convention) */
export const PUB15T_2026_WEEKLY_SINGLE = scaleBrackets(PUB15T_2026_BIWEEKLY_SINGLE, 0.5);
export const PUB15T_2026_WEEKLY_MARRIED = scaleBrackets(PUB15T_2026_BIWEEKLY_MARRIED, 0.5);
export const PUB15T_2026_WEEKLY_HOH = scaleBrackets(PUB15T_2026_BIWEEKLY_HOH, 0.5);

/** Semi-monthly ≈ biweekly × (24/26) */
const SM_FACTOR = 24 / 26;
export const PUB15T_2026_SEMIMONTHLY_SINGLE = scaleBrackets(
  PUB15T_2026_BIWEEKLY_SINGLE,
  SM_FACTOR,
);
export const PUB15T_2026_SEMIMONTHLY_MARRIED = scaleBrackets(
  PUB15T_2026_BIWEEKLY_MARRIED,
  SM_FACTOR,
);
export const PUB15T_2026_SEMIMONTHLY_HOH = scaleBrackets(PUB15T_2026_BIWEEKLY_HOH, SM_FACTOR);

/** Monthly ≈ biweekly × (12/26) */
const MO_FACTOR = 12 / 26;
export const PUB15T_2026_MONTHLY_SINGLE = scaleBrackets(PUB15T_2026_BIWEEKLY_SINGLE, MO_FACTOR);
export const PUB15T_2026_MONTHLY_MARRIED = scaleBrackets(PUB15T_2026_BIWEEKLY_MARRIED, MO_FACTOR);
export const PUB15T_2026_MONTHLY_HOH = scaleBrackets(PUB15T_2026_BIWEEKLY_HOH, MO_FACTOR);

export function defaultFederalPub15TTables() {
  return {
    version: "2026-pub15t-percentage",
    schedules: {
      weekly: {
        single: PUB15T_2026_WEEKLY_SINGLE,
        married: PUB15T_2026_WEEKLY_MARRIED,
        head_of_household: PUB15T_2026_WEEKLY_HOH,
      },
      biweekly: {
        single: PUB15T_2026_BIWEEKLY_SINGLE,
        married: PUB15T_2026_BIWEEKLY_MARRIED,
        head_of_household: PUB15T_2026_BIWEEKLY_HOH,
      },
      semimonthly: {
        single: PUB15T_2026_SEMIMONTHLY_SINGLE,
        married: PUB15T_2026_SEMIMONTHLY_MARRIED,
        head_of_household: PUB15T_2026_SEMIMONTHLY_HOH,
      },
      monthly: {
        single: PUB15T_2026_MONTHLY_SINGLE,
        married: PUB15T_2026_MONTHLY_MARRIED,
        head_of_household: PUB15T_2026_MONTHLY_HOH,
      },
    },
  };
}
