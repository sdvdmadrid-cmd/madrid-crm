const WEEKS_PER_YEAR = 52;

const PERIODS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export function normalizeStandardWeeklyHours(value, fallback = 40) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(168, Math.max(1, parsed));
}

export function computePayPreview(
  payType,
  hourlyRate,
  annualSalary,
  options = {},
) {
  const standardWeeklyHours = normalizeStandardWeeklyHours(
    options.standardWeeklyHours,
  );
  const defaultPaySchedule = String(
    options.defaultPaySchedule || "biweekly",
  ).toLowerCase();
  const hourly = Number(hourlyRate || 0);
  const salary = Number(annualSalary || 0);
  const isSalary = String(payType || "hourly").toLowerCase() === "salary";

  let grossAnnual = 0;
  let weekly = 0;

  if (isSalary) {
    grossAnnual = salary;
    weekly = grossAnnual / WEEKS_PER_YEAR;
  } else {
    weekly = hourly * standardWeeklyHours;
    grossAnnual = weekly * WEEKS_PER_YEAR;
  }

  const periodsPerYear = PERIODS_PER_YEAR[defaultPaySchedule] || 26;
  const perPayPeriod = grossAnnual / periodsPerYear;

  return {
    grossAnnual: roundMoney(grossAnnual),
    weekly: roundMoney(weekly),
    biweekly: roundMoney(perPayPeriod),
    standardWeeklyHours,
    defaultPaySchedule,
    periodsPerYear,
  };
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}
