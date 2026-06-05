/**
 * Payroll calendar — compute pay period dates and upcoming runs.
 */

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(date, weekStartDay = 1) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day >= weekStartDay ? day - weekStartDay : day + 7 - weekStartDay;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

export function computePayPeriod({ scheduleType = "biweekly", anchorDate = new Date(), weekStartDay = 1 }) {
  const schedule = String(scheduleType || "biweekly").toLowerCase();
  const anchor = new Date(anchorDate);

  if (schedule === "weekly") {
    const start = startOfWeek(anchor, weekStartDay);
    const end = addDays(start, 6);
    return { periodStart: toIso(start), periodEnd: toIso(end), payDate: toIso(addDays(end, 2)) };
  }

  if (schedule === "semimonthly") {
    const day = anchor.getUTCDate();
    if (day <= 15) {
      const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
      const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 15));
      return { periodStart: toIso(start), periodEnd: toIso(end), payDate: toIso(addDays(end, 3)) };
    }
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 16));
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
    return { periodStart: toIso(start), periodEnd: toIso(end), payDate: toIso(addDays(end, 3)) };
  }

  if (schedule === "monthly") {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
    return { periodStart: toIso(start), periodEnd: toIso(end), payDate: toIso(addDays(end, 5)) };
  }

  // biweekly — anchor from week start, 14-day periods
  const start = startOfWeek(anchor, weekStartDay);
  const end = addDays(start, 13);
  return { periodStart: toIso(start), periodEnd: toIso(end), payDate: toIso(addDays(end, 2)) };
}

export function upcomingPayPeriods({ scheduleType = "biweekly", count = 6, fromDate = new Date(), weekStartDay = 1 }) {
  const periods = [];
  let cursor = new Date(fromDate);

  for (let i = 0; i < count; i += 1) {
    const period = computePayPeriod({ scheduleType, anchorDate: cursor, weekStartDay });
    periods.push({ ...period, scheduleType });
    const nextStart = addDays(new Date(`${period.periodEnd}T12:00:00Z`), 1);
    cursor = nextStart;
  }

  return periods;
}

export const PAYROLL_SCHEDULES = [
  { id: "weekly", label: "Weekly", periodsPerYear: 52 },
  { id: "biweekly", label: "Bi-weekly", periodsPerYear: 26 },
  { id: "semimonthly", label: "Semi-monthly", periodsPerYear: 24 },
  { id: "monthly", label: "Monthly", periodsPerYear: 12 },
];
