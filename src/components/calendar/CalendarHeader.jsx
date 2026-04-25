"use client";

import { useTranslation } from "react-i18next";
import "@/i18n";

export default function CalendarHeader({
  currentDate,
  onPrevMonth,
  onNextMonth,
  onTodayClick,
}) {
  const { t } = useTranslation();

  const monthName = currentDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <header className="flex items-center justify-between px-3 sm:px-6 md:px-8 py-4 sm:py-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 text-white shadow-lg">
      <div>
        <h1 className="text-xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-white leading-none">
          {monthName}
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 mt-1">
          {t("calendar.scheduleYourAppointments")}
        </p>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onPrevMonth}
          className="h-9 w-9 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-lg sm:rounded-xl border border-white/20 bg-white/5 text-white hover:bg-white/15 hover:border-white/30 transition-all"
          aria-label={t("calendar.prevMonth")}
        >
          <span className="text-lg leading-none">❮</span>
        </button>

        <button
          onClick={onTodayClick}
          className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold bg-white text-slate-900 hover:bg-slate-100 rounded-lg sm:rounded-xl transition-all shadow"
        >
          {t("calendar.today")}
        </button>

        <button
          onClick={onNextMonth}
          className="h-9 w-9 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-lg sm:rounded-xl border border-white/20 bg-white/5 text-white hover:bg-white/15 hover:border-white/30 transition-all"
          aria-label={t("calendar.nextMonth")}
        >
          <span className="text-lg leading-none">❯</span>
        </button>
      </div>
    </header>
  );
}
