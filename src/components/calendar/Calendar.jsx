"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n";
import WeatherLocationAutocomplete from "@/components/calendar/WeatherLocationAutocomplete";
import CalendarHeader from "./CalendarHeader";
import DayCell from "./DayCell";
import AppointmentModal from "./AppointmentModal";
import { useAppointments } from "@/hooks/useAppointments";
import { useWeather } from "@/hooks/useWeather";
import { formatLocalDate, parseYmdToLocalDate } from "@/lib/local-date";

function guessLocationFromTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const parts = String(tz).split("/");
    const city = parts[parts.length - 1] || "";
    const normalized = city.replace(/_/g, " ").trim();
    return normalized || "Chicago, IL";
  } catch {
    return "Chicago, IL";
  }
}

const WEATHER_LOCATION_STORAGE_LABEL_KEY = "calendar.weather.location.label";
const WEATHER_LOCATION_STORAGE_QUERY_KEY = "calendar.weather.location.query";
const WEATHER_FALLBACK_LOCATION = "Chicago, IL";

function WeatherIcon({ variant = "default", isDay = true }) {
  const stroke =
    variant === "rain"
      ? "#2563eb"
      : variant === "storm"
        ? "#7c3aed"
        : variant === "snow"
          ? "#0f766e"
          : variant === "mist"
            ? "#64748b"
            : isDay
              ? "#f59e0b"
              : "#334155";
  const fill = isDay ? "#fef3c7" : "#dbeafe";

  if (variant === "rain") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M7 15h9a4 4 0 1 0-.7-7.94A5 5 0 0 0 6.2 8.8 3.5 3.5 0 0 0 7 15Z" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 17.5l-1 2M13 17.5l-1 2M17 17.5l-1 2" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (variant === "storm") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M7 14.5h9a4 4 0 1 0-.7-7.94A5 5 0 0 0 6.2 8.3 3.5 3.5 0 0 0 7 14.5Z" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m12 15-1.5 3h2l-1 3 3-4h-2l1-2Z" fill={stroke} stroke={stroke} strokeWidth="0.6" strokeLinejoin="round" />
      </svg>
    );
  }

  if (variant === "snow") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M7 14.5h9a4 4 0 1 0-.7-7.94A5 5 0 0 0 6.2 8.3 3.5 3.5 0 0 0 7 14.5Z" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 18.5h0M14 18.5h0M12 16.7v3.6M10.4 17.2l3.2 2.6M13.6 17.2l-3.2 2.6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (variant === "mist") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M5 9.5h14M3.5 13h17M6.5 16.5h11" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (variant === "clouds") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        {isDay ? <circle cx="8" cy="8" r="3" fill={fill} stroke="#f59e0b" strokeWidth="1.3" /> : <path d="M9.5 5.5a4 4 0 1 0 4 5.4A5 5 0 1 1 9.5 5.5Z" fill="#cbd5e1" stroke="#475569" strokeWidth="1.2" strokeLinejoin="round" />}
        <path d="M8 16h8a3.5 3.5 0 1 0-.6-6.95A4.3 4.3 0 0 0 7.5 10 3 3 0 0 0 8 16Z" fill="white" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (variant === "clear") {
    return isDay ? (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill={fill} stroke={stroke} strokeWidth="1.6" />
        <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.9 6.1l-1.5 1.5M7.6 16.4l-1.5 1.5M17.9 17.9l-1.5-1.5M7.6 7.6 6.1 6.1" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M14.5 4.5a6 6 0 1 0 5 9.3A7 7 0 1 1 14.5 4.5Z" fill="#dbeafe" stroke="#334155" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M7 15h9a4 4 0 1 0-.7-7.94A5 5 0 0 0 6.2 8.8 3.5 3.5 0 0 0 7 15Z" stroke="#64748b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Calendar() {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    appointments,
    loading,
    error: appointmentError,
    create,
    update,
    remove,
  } = useAppointments();

  const [defaultWeatherLocation, setDefaultWeatherLocation] = useState("");
  const [activeWeatherLocationLabel, setActiveWeatherLocationLabel] = useState("");
  const [weatherLocationInput, setWeatherLocationInput] = useState("");
  const [weatherLocationError, setWeatherLocationError] = useState("");
  const [weatherLocationNotice, setWeatherLocationNotice] = useState("");
  const [isApplyingWeatherLocation, setIsApplyingWeatherLocation] = useState(false);
  const [selectedForecastDate, setSelectedForecastDate] = useState("");
  const forecastScrollRef = useRef(null);
  const calendarGridRef = useRef(null);

  const scrollForecast = (dir) => {
    const el = forecastScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 400, behavior: "smooth" });
  };

  const scrollToCalendar = () => {
    const el = calendarGridRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const nextForecastDates = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const dates = [];
    for (let i = 0; i < 15; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      dates.push(formatLocalDate(d));
    }
    return dates;
  }, []);

  useEffect(() => {
    import("@/lib/client-auth").then(({ apiFetch }) => {
      apiFetch("/api/company-profile")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const addr = data?.businessAddress || "";
          if (addr) {
            setDefaultWeatherLocation(addr);
            setActiveWeatherLocationLabel(addr);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(WEATHER_LOCATION_STORAGE_LABEL_KEY, addr);
              window.localStorage.setItem(WEATHER_LOCATION_STORAGE_QUERY_KEY, addr);
            }
          }
        })
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (defaultWeatherLocation) return;
    if (typeof window !== "undefined") {
      const storedLabel = window.localStorage.getItem(WEATHER_LOCATION_STORAGE_LABEL_KEY) || "";
      const storedQuery = window.localStorage.getItem(WEATHER_LOCATION_STORAGE_QUERY_KEY) || "";
      if (storedLabel || storedQuery) {
        setDefaultWeatherLocation(storedQuery || storedLabel);
        setActiveWeatherLocationLabel(storedLabel || storedQuery);
        return;
      }
    }
    const appointmentLocation = appointments.find((apt) => String(apt?.location || "").trim())?.location;
    if (appointmentLocation) {
      setDefaultWeatherLocation(appointmentLocation);
      setActiveWeatherLocationLabel(appointmentLocation);
      return;
    }
    const guessedLocation = guessLocationFromTimezone();
    setDefaultWeatherLocation(guessedLocation);
    setActiveWeatherLocationLabel(guessedLocation);
    if (!globalThis.navigator?.geolocation) return;
    globalThis.navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!coords) return;
        setDefaultWeatherLocation(`${coords.latitude},${coords.longitude}`);
        setActiveWeatherLocationLabel(guessedLocation);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, [appointments, defaultWeatherLocation]);

  useEffect(() => {
    setWeatherLocationInput(activeWeatherLocationLabel || defaultWeatherLocation || "");
  }, [activeWeatherLocationLabel, defaultWeatherLocation]);


  // Get user's timezone for better date handling
  const getUserTimezone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  const userTimezone = getUserTimezone();

  // Generate calendar grid
  const { daysInMonth, firstDayOfMonth, daysOfWeek } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    return {
      daysInMonth: lastDay,
      firstDayOfMonth: firstDay,
      daysOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    };
  }, [currentDate]);

  const calendarDays = useMemo(() => {
    const days = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Previous month days (grayed out)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        date,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({
        date,
        isCurrentMonth: true,
      });
    }

    // Next month days (grayed out)
    const remainingDays = 42 - days.length; // 6 rows × 7 days
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate, daysInMonth, firstDayOfMonth]);

  const { getWeather, getDayWeather } = useWeather(appointments, {
    calendarDays,
    defaultLocation: defaultWeatherLocation,
    forecastDates: nextForecastDates,
  });

  const selectedForecastWeather = selectedForecastDate
    ? getDayWeather(selectedForecastDate)
    : null;

  const selectedForecastDateObj = selectedForecastDate
    ? parseYmdToLocalDate(selectedForecastDate)
    : null;

  const visibleHourlyForecast = useMemo(() => {
    const rows = selectedForecastWeather?.hourly || [];
    if (rows.length > 12) {
      return rows.filter((_, index) => index % 2 === 0);
    }
    return rows;
  }, [selectedForecastWeather]);

  const resolveWeatherLocation = async (locationValue) => {
    const response = await fetch(
      `/api/weather/resolve-location?location=${encodeURIComponent(locationValue)}`,
      { credentials: "include" },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) return null;
    return payload;
  };

  const fetchWeatherLocationSuggestions = async (locationValue) => {
    const response = await fetch(
      `/api/weather/location-autocomplete?input=${encodeURIComponent(locationValue)}`,
      { credentials: "include" },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !Array.isArray(payload.predictions)) {
      return [];
    }
    return payload.predictions;
  };

  const persistWeatherLocation = (queryValue, labelValue) => {
    if (typeof window === "undefined") return;
    const safeLabel = String(labelValue || "").trim();
    const safeQuery = String(queryValue || "").trim();
    if (!safeLabel || !safeQuery) return;
    window.localStorage.setItem(WEATHER_LOCATION_STORAGE_LABEL_KEY, safeLabel);
    window.localStorage.setItem(WEATHER_LOCATION_STORAGE_QUERY_KEY, safeQuery);
  };

  const setWeatherLocationFromResolved = (resolved, fallbackLabel = "") => {
    const label = String(resolved?.normalizedLocation || fallbackLabel || "").trim();
    const query =
      Number.isFinite(resolved?.latitude) && Number.isFinite(resolved?.longitude)
        ? `${resolved.latitude},${resolved.longitude}`
        : label;
    if (!label || !query) return false;
    setWeatherLocationInput(label);
    setActiveWeatherLocationLabel(label);
    setDefaultWeatherLocation(query);
    persistWeatherLocation(query, label);
    return true;
  };

  const applyWeatherLocation = async () => {
    const nextLocation = String(weatherLocationInput || "").trim();
    if (!nextLocation) {
      setWeatherLocationError("");
      setWeatherLocationNotice("");
      return;
    }

    setIsApplyingWeatherLocation(true);
    setWeatherLocationError("");
    setWeatherLocationNotice("");
    try {
      const resolved = await resolveWeatherLocation(nextLocation);
      if (resolved?.normalizedLocation && setWeatherLocationFromResolved(resolved)) {
        return;
      }

      const suggestions = await fetchWeatherLocationSuggestions(nextLocation);
      const bestMatch = suggestions[0];
      if (bestMatch?.normalizedLocation) {
        const bestResolved = {
          normalizedLocation: bestMatch.normalizedLocation,
          latitude: bestMatch.latitude,
          longitude: bestMatch.longitude,
        };
        if (setWeatherLocationFromResolved(bestResolved)) {
          setWeatherLocationNotice(
            t("calendar.weather.locationBestMatch", {
              location: bestMatch.normalizedLocation,
            }),
          );
          return;
        }
      }

      const storedLabel =
        typeof window !== "undefined"
          ? window.localStorage.getItem(WEATHER_LOCATION_STORAGE_LABEL_KEY) || ""
          : "";
      const storedQuery =
        typeof window !== "undefined"
          ? window.localStorage.getItem(WEATHER_LOCATION_STORAGE_QUERY_KEY) || ""
          : "";

      const fallbackLabel =
        storedLabel ||
        activeWeatherLocationLabel ||
        defaultWeatherLocation ||
        WEATHER_FALLBACK_LOCATION;
      const fallbackQuery = storedQuery || fallbackLabel;

      const fallbackResolved = await resolveWeatherLocation(fallbackQuery);
      const usedFallback =
        (fallbackResolved?.normalizedLocation &&
          setWeatherLocationFromResolved(fallbackResolved, fallbackLabel)) ||
        setWeatherLocationFromResolved(
          { normalizedLocation: fallbackLabel },
          fallbackLabel,
        );

      if (usedFallback) {
        setWeatherLocationNotice(
          t("calendar.weather.locationFallbackNotice", { location: fallbackLabel }),
        );
        return;
      }

      setWeatherLocationError(t("calendar.weather.locationInvalid"));
    } catch {
      setWeatherLocationError(t("calendar.weather.locationInvalid"));
    } finally {
      setIsApplyingWeatherLocation(false);
    }
  };

  const isToday = (date) => {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const handlePrevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  };

  const handleDayClick = (date) => {
    setSelectedDate(date);
    setEditingAppointment(null);
    setIsModalOpen(true);
  };

  const handleEventClick = (appointment) => {
    setSelectedDate(parseYmdToLocalDate(appointment.date));
    setEditingAppointment(appointment);
    setIsModalOpen(true);
  };

  const handleSaveAppointment = async (formData) => {
    setIsSaving(true);
    try {
      if (editingAppointment) {
        await update(editingAppointment._id, formData);
      } else {
        await create(formData);
      }
      setIsModalOpen(false);
      setEditingAppointment(null);
      setSelectedDate(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAppointment = async () => {
    if (!editingAppointment) return;

    setIsSaving(true);
    try {
      await remove(editingAppointment._id);
      setIsModalOpen(false);
      setEditingAppointment(null);
      setSelectedDate(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden flex flex-col bg-slate-100/70">
      {/* Header */}
      <CalendarHeader
        currentDate={currentDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onTodayClick={() => setCurrentDate(new Date())}
      />

      {/* Error state */}
      {appointmentError && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700">{appointmentError}</p>
        </div>
      )}

      {/* Always-visible 15-day weather forecast */}
      <div className="relative z-0 px-3 sm:px-6 md:px-8 pt-3 flex-none">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm max-h-[50vh] overflow-y-auto">
          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {t("calendar.weather.changeLocationLabel")}
              </label>
              <WeatherLocationAutocomplete
                value={weatherLocationInput}
                onChange={(value) => {
                  setWeatherLocationInput(value);
                  setWeatherLocationError("");
                  setWeatherLocationNotice("");
                }}
                onSelect={(place) => {
                  // Auto-apply immediately when user picks from dropdown
                  const label = place.normalizedLocation || place.primaryText || "";
                  setWeatherLocationInput(label);
                  setWeatherLocationError("");
                  setWeatherLocationNotice("");
                  if (label) {
                    setWeatherLocationFromResolved({
                      normalizedLocation: label,
                      latitude: place.latitude,
                      longitude: place.longitude,
                    });
                  }
                }}
                onApply={applyWeatherLocation}
                placeholder={t("calendar.weather.changeLocationPlaceholder")}
                inputClass="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {t("calendar.weather.locationSuggestionHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={applyWeatherLocation}
              disabled={isApplyingWeatherLocation}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
            >
              {isApplyingWeatherLocation
                ? t("calendar.weather.checkingLocation")
                : t("calendar.weather.applyLocation")}
            </button>
          </div>
          {weatherLocationError ? (
            <div className="mb-2 text-xs font-medium text-red-700">{weatherLocationError}</div>
          ) : null}
          {!weatherLocationError && weatherLocationNotice ? (
            <div className="mb-2 text-xs font-medium text-blue-700">{weatherLocationNotice}</div>
          ) : null}
          {defaultWeatherLocation ? (
            <div className="mb-3 text-xs text-slate-600">
              {t("calendar.weather.activeLocation")}: <span className="font-semibold">{activeWeatherLocationLabel || defaultWeatherLocation}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => scrollForecast(-1)}
              aria-label="Scroll forecast left"
              className="flex-none rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50"
            >
              &#8592;
            </button>
            <div className="overflow-x-auto flex-1" data-testid="calendar-forecast-strip" ref={forecastScrollRef}>
              <div className="flex min-w-max gap-2 pb-1">
              {nextForecastDates.map((dateKey) => {
              const dateObj = parseYmdToLocalDate(dateKey);
              const weather = getDayWeather(dateKey);
              const isSelected = selectedForecastDate === dateKey;
              return (
                <button
                  type="button"
                  key={dateKey}
                  onClick={() => setSelectedForecastDate(dateKey)}
                  className={`w-[132px] shrink-0 rounded-lg border bg-slate-50 px-2 py-2 text-left text-xs ${isSelected ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}
                  data-testid={`forecast-day-${dateKey}`}
                >
                  <div className="font-semibold text-slate-700">
                    {dateObj
                      ? dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                      : dateKey}
                  </div>
                  {weather ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-slate-800">
                      <span>{weather.emoji}</span>
                      <span>{weather.temp}°F</span>
                      {weather.fallback ? (
                        <span
                          className="ml-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                          title={t("calendar.weather.fallbackHint")}
                        >
                          {t("calendar.weather.fallbackLabel")}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1 text-slate-500">{t("calendar.weather.unavailable")}</div>
                  )}
                </button>
              );
            })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => scrollForecast(1)}
              aria-label="Scroll forecast right"
              className="flex-none rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50"
            >
              &#8594;
            </button>
          </div>
          <button
            type="button"
            onClick={scrollToCalendar}
            className="mb-2 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
          >
            &#8595; {t("calendar.weather.scrollToCalendar")}
          </button>

          {selectedForecastDate ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 sm:p-3 max-h-64 overflow-y-auto">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                {t("calendar.weather.hourlyTitle")} {selectedForecastDateObj
                  ? selectedForecastDateObj.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
                  : ""}
              </div>
              {visibleHourlyForecast.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-3">
                  {visibleHourlyForecast.map((hourRow) => (
                    <div
                      key={`${selectedForecastDate}-${hourRow.time}`}
                      className="min-w-[156px] shrink-0 snap-start rounded-xl border border-slate-200 bg-white/95 px-2.5 py-2 text-[11px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:min-w-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold tracking-[-0.01em] text-slate-800">{hourRow.time}</div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-400">{hourRow.condition}</div>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-800">
                          <WeatherIcon variant={hourRow.variant} isDay={hourRow.isDay !== false} />
                          <span className="font-semibold">{hourRow.temp}°F</span>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-slate-500">
                        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                          {t("calendar.weather.humidity", { pct: hourRow.humidity })}
                        </div>
                        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                          {t("calendar.weather.wind", { speed: hourRow.windSpeed })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500">{t("calendar.weather.noHourly")}</div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t("calendar.loading")}</p>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && (
        <div className="relative z-10 w-full min-w-0" ref={calendarGridRef}>
          <div className="p-3 sm:p-5 md:p-8">
            {/* Day of week headers */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3 mb-2 px-1">
              {daysOfWeek.map((day, i) => (
                <div
                  key={day}
                  className={`text-center text-[9px] sm:text-[10px] md:text-[11px] font-semibold py-1.5 sm:py-2 uppercase tracking-[0.06em] ${
                    i === 0 || i === 6 ? "text-rose-500" : "text-slate-500"
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3 bg-transparent min-w-0">
              {calendarDays.map((dayObj, index) => (
                <DayCell
                  key={index}
                  day={dayObj.date.getDate()}
                  date={dayObj.date}
                  dateKey={formatLocalDate(dayObj.date)}
                  isCurrentMonth={dayObj.isCurrentMonth}
                  isToday={isToday(dayObj.date)}
                  appointments={appointments}
                  onClick={handleDayClick}
                  onEventClick={handleEventClick}
                  getWeather={getWeather}
                  getDayWeather={getDayWeather}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <AppointmentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingAppointment(null);
        }}
        onSave={handleSaveAppointment}
        initialDate={selectedDate}
        existingAppointment={editingAppointment}
        isSaving={isSaving}
        onDelete={editingAppointment ? handleDeleteAppointment : null}
        weather={
          editingAppointment
            ? getWeather(editingAppointment.location, editingAppointment.date)
            : null
        }
      />
    </div>
  );
}
