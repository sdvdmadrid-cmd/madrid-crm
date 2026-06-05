import { payPeriodsPerYear } from "./payroll-calculator.js";
import { computePayPeriod } from "./payroll-calendar.js";
import { normalizeStandardWeeklyHours } from "./payroll-pay-preview.js";

export function mergeTaxTablesWithSettings(taxTables = {}, settings = {}) {
  const merged = {
    ...taxTables,
    futa: {
      ...(taxTables.futa || {}),
      rate: Number(settings.futaRate ?? taxTables.futa?.rate ?? 0.006),
    },
    stateSutaRates: {
      ...(taxTables.stateSutaRates || {}),
    },
  };

  return merged;
}

export function taxTablesForEmployee(baseTables, settings = {}, employee = {}) {
  const merged = mergeTaxTablesWithSettings(baseTables, settings);
  const workState = String(
    employee.workState ||
      employee.work_state ||
      employee.addressState ||
      employee.address_state ||
      settings.defaultWorkState ||
      "",
  )
    .trim()
    .toUpperCase();

  if (workState && settings.sutaRate != null) {
    merged.stateSutaRates = {
      ...merged.stateSutaRates,
      [workState]: {
        ...(merged.stateSutaRates?.[workState] || {}),
        sutaRate: Number(settings.sutaRate),
        wageBase: Number(merged.stateSutaRates?.[workState]?.wageBase ?? 7000),
      },
    };
  }

  return merged;
}

export function applyEmployeeSettingsDefaults(employee = {}, settings = {}) {
  const next = { ...employee };
  if (!next.workState && !next.work_state && settings.defaultWorkState) {
    next.workState = settings.defaultWorkState;
  }
  return next;
}

export function overtimeHoursThresholdForPeriod(standardWeeklyHours, scheduleType) {
  const hours = normalizeStandardWeeklyHours(standardWeeklyHours);
  const periodsPerYear = payPeriodsPerYear(scheduleType);
  const weeksInPeriod = 52 / Math.max(1, periodsPerYear);
  return Number((hours * weeksInPeriod).toFixed(2));
}

export function resolveRunItemHours({
  hoursRegular = 0,
  hoursOvertime = 0,
  standardWeeklyHours = 40,
  scheduleType = "biweekly",
}) {
  const regular = Number(hoursRegular || 0);
  const overtime = Number(hoursOvertime || 0);

  if (overtime > 0) {
    return {
      hoursRegular: regular,
      hoursOvertime: overtime,
      autoSplitApplied: false,
    };
  }

  const threshold = overtimeHoursThresholdForPeriod(
    standardWeeklyHours,
    scheduleType,
  );

  if (regular <= threshold) {
    return {
      hoursRegular: regular,
      hoursOvertime: 0,
      autoSplitApplied: false,
    };
  }

  return {
    hoursRegular: threshold,
    hoursOvertime: Number((regular - threshold).toFixed(2)),
    autoSplitApplied: true,
  };
}

export function suggestedPayRunFromSettings(settings = {}, anchorDate = new Date()) {
  const scheduleType = settings.defaultPaySchedule || "biweekly";
  const period = computePayPeriod({
    scheduleType,
    anchorDate,
    weekStartDay: Number(settings.payWeekStartDay ?? 1),
  });

  return {
    title: `Payroll ${period.periodEnd}`,
    scheduleType,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    payDate: period.payDate,
    standardWeeklyHours: normalizeStandardWeeklyHours(settings.standardWeeklyHours),
    payWeekStartDay: Number(settings.payWeekStartDay ?? 1),
  };
}
