"use client";

import { useState } from "react";
import WeatherBadge from "./WeatherBadge";

export default function DayCell({
  day,
  date,
  isCurrentMonth,
  isToday,
  appointments,
  onClick,
  onEventClick,
  getWeather,
  getDayWeather,
}) {
  const dayNumber = date.getDate();
  const [expandedEvents, setExpandedEvents] = useState(false);

  const dayAppointments = appointments.filter((apt) => {
    const aptDate = new Date(apt.date);
    return (
      aptDate.getFullYear() === date.getFullYear() &&
      aptDate.getMonth() === date.getMonth() &&
      aptDate.getDate() === date.getDate()
    );
  });

  const statusColors = {
    Scheduled: "bg-sky-50/90 text-sky-800 border-sky-200/80",
    Completed: "bg-emerald-50/90 text-emerald-800 border-emerald-200/80",
    Cancelled: "bg-rose-50/90 text-rose-700 border-rose-200/90",
  };

  const visibleAppointments = dayAppointments.slice(
    0,
    expandedEvents ? dayAppointments.length : 2,
  );

  return (
    <div
      onClick={() => isCurrentMonth && !expandedEvents && onClick(date)}
      className={`
        min-h-[110px] sm:min-h-[135px] lg:min-h-[170px] p-2 sm:p-3 border rounded-xl sm:rounded-2xl transition-all cursor-pointer
        ${isCurrentMonth ? "bg-white border-slate-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300" : "bg-slate-50/50 border-slate-200/70"}
        ${isToday ? "ring-2 ring-blue-500/60" : ""}
      `}
    >
      {/* Day number + day-level weather */}
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
              className="text-[10px] sm:text-[11px] font-semibold leading-none inline-flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-1 bg-slate-100 text-slate-700"
              title={`${dw.condition} · Feels like ${dw.feelsLike}°`}
            >
              <span>{dw.emoji}</span>
              <span>{dw.temp}°</span>
            </span>
          );
        })()}
      </div>

      {/* Appointments */}
      <div className="space-y-1.5 sm:space-y-2">
        {visibleAppointments.map((apt) => {
          const weather = getWeather
            ? getWeather(apt.location, apt.date) || (getDayWeather ? getDayWeather(apt.date) : null)
            : null;
          return (
            <div
              key={apt._id}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(apt);
              }}
              className={`
                text-[11px] sm:text-xs px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl border cursor-pointer
                hover:shadow-md hover:-translate-y-0.5 transition-all
                ${statusColors[apt.status] || "bg-gray-100 text-gray-800 border-gray-200"}
              `}
              title={`${apt.title}${apt.location ? " · " + apt.location : ""}`}
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
                    <div className="text-[9px] sm:text-[10px] opacity-70 truncate mt-0.5">{apt.clientName}</div>
                  )}
                </div>
                {weather && (
                  <WeatherBadge weather={weather} compact />
                )}
              </div>
              {apt.location && weather && (
                <div className="text-[9px] opacity-60 truncate mt-0.5 sm:mt-1">
                  📍 {apt.location}
                </div>
              )}
            </div>
          );
        })}

        {dayAppointments.length > 2 && !expandedEvents && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedEvents(true);
            }}
            className="text-xs text-blue-700 hover:text-blue-900 px-2 py-0.5 font-medium w-full text-left"
          >
            +{dayAppointments.length - 2} more
          </button>
        )}

        {expandedEvents && dayAppointments.length > 2 && (
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

