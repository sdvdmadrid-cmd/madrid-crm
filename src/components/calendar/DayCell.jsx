"use client";

import { memo, useMemo, useState } from "react";
import WeatherBadge from "./WeatherBadge";

const COLLAPSED_EVENT_LIMIT = 3;

function DayCell({
  day,
  date,
  dateKey,
  isCurrentMonth,
  isToday,
  dayAppointments = [],
  scheduledJobs = [],
  scheduledEstimates = [],
  onClick,
  onEventClick,
  onJobClick,
  onEstimateClick,
  onReschedule,
  draggingAppointmentId = "",
  onDragStart,
  onDragEnd,
  getWeather,
  getDayWeather,
}) {
  const dayNumber = date.getDate();
  const [expandedEvents, setExpandedEvents] = useState(false);
  const [dropHighlight, setDropHighlight] = useState(false);

  const statusColors = {
    Scheduled: "bg-sky-50/90 text-sky-800 border-sky-200/80",
    Completed: "bg-emerald-50/90 text-emerald-800 border-emerald-200/80",
    Cancelled: "bg-rose-50/90 text-rose-700 border-rose-200/90",
  };

  const calendarItems = useMemo(() => {
    const items = [];
    for (const apt of dayAppointments) {
      items.push({ kind: "appointment", key: `apt-${apt._id}`, data: apt });
    }
    for (const job of scheduledJobs) {
      const id = job._id || job.id;
      items.push({ kind: "job", key: `job-${id}`, data: job });
    }
    for (const est of scheduledEstimates) {
      items.push({ kind: "estimate", key: `est-${est.id}`, data: est });
    }
    return items;
  }, [dayAppointments, scheduledJobs, scheduledEstimates]);

  const visibleItems = calendarItems.slice(
    0,
    expandedEvents ? calendarItems.length : COLLAPSED_EVENT_LIMIT,
  );
  const hiddenCount = Math.max(0, calendarItems.length - COLLAPSED_EVENT_LIMIT);

  const allowDrop = Boolean(onReschedule);

  return (
    <div
      onClick={() => !expandedEvents && onClick(date)}
      data-testid={dateKey ? `calendar-day-${dateKey}` : undefined}
      data-is-current-month={isCurrentMonth ? "true" : "false"}
      onDragOver={(e) => {
        if (!allowDrop || !draggingAppointmentId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropHighlight(true);
      }}
      onDragLeave={() => setDropHighlight(false)}
      onDrop={(e) => {
        if (!allowDrop) return;
        e.preventDefault();
        e.stopPropagation();
        setDropHighlight(false);
        const id = e.dataTransfer.getData("application/appointment-id");
        if (id) onReschedule(id, dateKey);
        onDragEnd?.();
      }}
      className={`
        min-w-0 min-h-[80px] sm:min-h-[110px] lg:min-h-[150px] p-1.5 sm:p-2 md:p-3 border rounded-lg sm:rounded-xl md:rounded-2xl transition-all cursor-pointer
        ${isCurrentMonth ? "bg-white border-slate-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300" : "bg-slate-50/50 border-slate-200/70"}
        ${isToday ? "ring-2 ring-blue-500/60" : ""}
        ${dropHighlight ? "ring-2 ring-emerald-400/70 bg-emerald-50/40" : ""}
      `}
    >
      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
        <span
          className={`
            text-xs sm:text-sm font-bold w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full
            ${!isCurrentMonth ? "text-slate-400" : isToday ? "bg-blue-600 text-white shadow" : "text-slate-900"}
          `}
        >
          {dayNumber}
        </span>
        {(() => {
          const dw = getDayWeather ? getDayWeather(date) : null;
          if (!dw) return null;
          return (
            <span
              className="text-[10px] sm:text-[11px] font-semibold leading-none inline-flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-1 bg-slate-100 text-slate-700 animate-weather-bounce"
              title={`${dw.condition} · Feels like ${dw.feelsLike}°`}
              style={{ transition: "background 0.5s, color 0.5s" }}
            >
              <span className="drop-shadow-md animate-fade-in" aria-hidden="true">
                {dw.emoji}
              </span>
              <span>{dw.temp}°</span>
            </span>
          );
        })()}
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        {visibleItems.map((item) => {
          if (item.kind === "appointment") {
            const apt = item.data;
            const weather = getWeather
              ? getWeather(apt.location, apt.date) ||
                (getDayWeather ? getDayWeather(apt.date) : null)
              : null;
            return (
              <div
                key={item.key}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData("application/appointment-id", apt._id);
                  e.dataTransfer.effectAllowed = "move";
                  onDragStart?.(apt._id);
                }}
                onDragEnd={(e) => {
                  e.stopPropagation();
                  onDragEnd?.();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(apt);
                }}
                className={`
                  text-[11px] sm:text-xs px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl border cursor-grab active:cursor-grabbing
                  hover:shadow-md hover:-translate-y-0.5 transition-all
                  ${draggingAppointmentId === apt._id ? "opacity-50" : ""}
                  ${statusColors[apt.status] || "bg-gray-100 text-gray-800 border-gray-200"}
                `}
                title={`${apt.title}${apt.location ? " · " + apt.location : ""} — drag to reschedule`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[11px] sm:text-[12px] truncate leading-tight">
                      {apt.time && (
                        <span className="text-[10px] opacity-70 mr-1">{apt.time}</span>
                      )}
                      {apt.title}
                    </div>
                    {apt.clientName && (
                      <div className="text-[9px] sm:text-[10px] opacity-70 truncate mt-0.5">
                        {apt.clientName}
                      </div>
                    )}
                  </div>
                  {weather && <WeatherBadge weather={weather} compact />}
                </div>
                {apt.location && weather && (
                  <div className="text-[9px] opacity-60 truncate mt-0.5 sm:mt-1">
                    📍 {apt.location}
                  </div>
                )}
              </div>
            );
          }

          if (item.kind === "job") {
            const job = item.data;
            const id = job._id || job.id;
            const title = job.title || job.clientName || "Job";
            return (
              <div
                key={item.key}
                data-testid={id ? `calendar-job-${id}` : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onJobClick?.(job);
                }}
                className="text-[11px] sm:text-xs px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl border cursor-pointer
                  bg-amber-50/95 text-amber-900 border-amber-200/90
                  hover:shadow-md hover:-translate-y-0.5 transition-all"
                title={`Job: ${title}`}
              >
                <div className="font-semibold text-[11px] sm:text-[12px] truncate leading-tight">
                  <span className="text-[9px] uppercase tracking-wide opacity-70 mr-1">
                    Job
                  </span>
                  {title}
                </div>
                {job.clientName && job.title ? (
                  <div className="text-[9px] sm:text-[10px] opacity-70 truncate mt-0.5">
                    {job.clientName}
                  </div>
                ) : null}
              </div>
            );
          }

          const est = item.data;
          const label =
            est.estimateNumber ||
            est.clientName ||
            "Site visit";
          return (
            <div
              key={item.key}
              data-testid={est.id ? `calendar-estimate-${est.id}` : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onEstimateClick?.(est);
              }}
              className="text-[11px] sm:text-xs px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl border cursor-pointer
                bg-violet-50/95 text-violet-900 border-violet-200/90
                hover:shadow-md hover:-translate-y-0.5 transition-all"
              title={`Estimate visit: ${label}`}
            >
              <div className="font-semibold text-[11px] sm:text-[12px] truncate leading-tight">
                <span className="text-[9px] uppercase tracking-wide opacity-70 mr-1">
                  Visit
                </span>
                {label}
              </div>
              {est.clientName && est.estimateNumber ? (
                <div className="text-[9px] sm:text-[10px] opacity-70 truncate mt-0.5">
                  {est.clientName}
                </div>
              ) : null}
            </div>
          );
        })}

        {hiddenCount > 0 && !expandedEvents && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedEvents(true);
            }}
            className="text-xs text-blue-700 hover:text-blue-900 px-2 py-0.5 font-medium w-full text-left"
          >
            +{hiddenCount} more
          </button>
        )}

        {expandedEvents && calendarItems.length > COLLAPSED_EVENT_LIMIT && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedEvents(false);
            }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5 font-medium"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(DayCell);
