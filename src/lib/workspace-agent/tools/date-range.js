/**
 * Pure date-range helpers for workspace agent calendar tools (unit-testable).
 */

import { isValidYmd } from "../../local-date.js";

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function resolveDateRange(args = {}) {
  const fromArg = String(args.from || args.startDate || "").trim();
  const toArg = String(args.to || args.endDate || "").trim();
  if (isValidYmd(fromArg) && isValidYmd(toArg)) {
    return { from: fromArg, to: toArg };
  }

  const range = String(args.range || "this_week").trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (range === "today") {
    const ymd = toYmd(today);
    return { from: ymd, to: ymd };
  }

  if (range === "tomorrow") {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    const ymd = toYmd(t);
    return { from: ymd, to: ymd };
  }

  if (range === "this_month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toYmd(start), to: toYmd(end) };
  }

  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return { from: toYmd(weekStart), to: toYmd(weekEnd) };
}
