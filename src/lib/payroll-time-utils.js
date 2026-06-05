import { roundMoney } from "./payroll-money.js";

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
