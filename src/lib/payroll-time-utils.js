import { roundMoney } from "./payroll-money.js";
import { resolveRunItemHours } from "./payroll-settings-utils.js";

export function computeHoursFromClock(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return roundMoney((end - start) / 3_600_000);
}

export function aggregateTimeForPayRun(entries = []) {
  let regular = 0;
  let overtime = 0;
  let pto = 0;
  let sick = 0;

  for (const entry of entries) {
    const h = Number(entry.hours || 0);
    const type = String(entry.entryType || entry.entry_type || "regular");
    if (type === "overtime") overtime += h;
    else if (type === "pto") pto += h;
    else if (type === "sick") sick += h;
    else regular += h;
  }

  return {
    hoursRegular: roundMoney(regular),
    hoursOvertime: roundMoney(overtime),
    ptoHours: roundMoney(pto),
    sickHours: roundMoney(sick),
  };
}

export function groupTimeEntriesByEmployee(entries = []) {
  const map = new Map();
  for (const entry of entries || []) {
    const employeeId = entry.employeeId || entry.employee_id;
    if (!employeeId) continue;
    const bucket = map.get(employeeId) || [];
    bucket.push(entry);
    map.set(employeeId, bucket);
  }
  return map;
}

export function buildRunLineFromTimeEntries(
  entries = [],
  settings = {},
  scheduleType = "biweekly",
) {
  const aggregated = aggregateTimeForPayRun(
    entries.map((entry) => ({
      hours: entry.hours,
      entryType: entry.entryType || entry.entry_type,
    })),
  );

  const resolved = resolveRunItemHours({
    hoursRegular: aggregated.hoursRegular,
    hoursOvertime: aggregated.hoursOvertime,
    standardWeeklyHours: settings.standardWeeklyHours,
    scheduleType,
    autoSplitOvertime: settings.autoSplitOvertime !== false,
  });

  const hourlyRate = Number(
    entries.find((entry) => Number(entry.hourlyRate || entry.hourly_rate || 0) > 0)
      ?.hourlyRate ||
      entries.find((entry) => Number(entry.hourly_rate || 0) > 0)?.hourly_rate ||
      0,
  );

  return {
    employeeId: entries[0]?.employeeId || entries[0]?.employee_id || null,
    hoursRegular: resolved.hoursRegular,
    hoursOvertime: resolved.hoursOvertime,
    ptoHours: aggregated.ptoHours,
    sickHours: aggregated.sickHours,
    hourlyRate,
    autoSplitApplied: resolved.autoSplitApplied,
  };
}
