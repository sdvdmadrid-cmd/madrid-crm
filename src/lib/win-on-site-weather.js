export const WIN_ON_SITE_HIGH_WIND_MPH = 25;
export const WIN_ON_SITE_FREEZE_TEMP_F = 35;
export const WIN_ON_SITE_SLOT_WINDOWS = [
  { id: "morning", time: "09:00", label: "Morning" },
  { id: "afternoon", time: "13:00", label: "Afternoon" },
];

/**
 * Score a forecast day for outdoor / pour-sensitive work.
 * Mirrors calendar AppointmentModal heuristics + freeze proxy via avg temp.
 */
export function scoreWinOnSiteWeatherDay(weather) {
  if (!weather || typeof weather !== "object") {
    return { safe: false, risk: "unavailable", score: 0 };
  }

  const variant = String(weather.variant || "").toLowerCase();
  const windSpeed = Number(weather.windSpeed || 0);
  const temp = Number(weather.temp);

  if (variant === "storm") {
    return { safe: false, risk: "storm", score: 0 };
  }
  if (variant === "snow") {
    return { safe: false, risk: "snow", score: 5 };
  }
  if (variant === "rain") {
    return { safe: false, risk: "rain", score: 10 };
  }
  if (Number.isFinite(temp) && temp < WIN_ON_SITE_FREEZE_TEMP_F) {
    return { safe: false, risk: "freeze", score: 15 };
  }
  if (windSpeed >= WIN_ON_SITE_HIGH_WIND_MPH) {
    return { safe: false, risk: "wind", score: 20 };
  }
  if (variant === "mist") {
    return { safe: true, risk: "mist", score: 70 };
  }
  if (variant === "clouds") {
    return { safe: true, risk: null, score: 85 };
  }
  if (variant === "clear") {
    return { safe: true, risk: null, score: 100 };
  }
  return { safe: true, risk: null, score: 75 };
}

export function isWinOnSiteWeatherSafeDay(weather) {
  return scoreWinOnSiteWeatherDay(weather).safe === true;
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function listUpcomingYmdDates({ fromYmd, days = 12, skipToday = true } = {}) {
  const start = String(fromYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const out = [];
  const offsetStart = skipToday ? 1 : 0;
  for (let i = offsetStart; i < offsetStart + days; i += 1) {
    out.push(addDaysYmd(start, i));
  }
  return out;
}

/**
 * Build suggested booking slots from a map of date -> weather day.
 * Prefers morning on clear days; otherwise afternoon; max `limit` slots.
 */
export function buildWinOnSiteWeatherSlots({
  weatherByDate = {},
  fromYmd,
  limit = 5,
  windows = WIN_ON_SITE_SLOT_WINDOWS,
} = {}) {
  const dates = listUpcomingYmdDates({ fromYmd, days: 12, skipToday: true });
  const candidates = [];

  for (const date of dates) {
    const weather = weatherByDate[date];
    const scored = scoreWinOnSiteWeatherDay(weather);
    if (!scored.safe) continue;

    const preferredWindow =
      scored.score >= 90
        ? windows.find((w) => w.id === "morning") || windows[0]
        : windows.find((w) => w.id === "afternoon") || windows[0];

    candidates.push({
      id: `${date}_${preferredWindow.id}`,
      date,
      time: preferredWindow.time,
      window: preferredWindow.id,
      windowLabel: preferredWindow.label,
      label: `${preferredWindow.label} · ${date}`,
      score: scored.score,
      risk: scored.risk,
      weather: weather
        ? {
            emoji: weather.emoji || "",
            temp: weather.temp ?? null,
            variant: weather.variant || "",
            condition: weather.condition || "",
            description: weather.description || "",
            windSpeed: weather.windSpeed ?? 0,
          }
        : null,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
}

export function normalizePreferredSlot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const date = String(raw.date || "").trim();
  const time = String(raw.time || "").trim();
  const window = String(raw.window || "").trim().toLowerCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  return {
    date,
    time,
    window: window || (time < "12:00" ? "morning" : "afternoon"),
    windowLabel: String(raw.windowLabel || "").trim().slice(0, 40),
    label: String(raw.label || "").trim().slice(0, 120),
    weather: raw.weather && typeof raw.weather === "object"
      ? {
          emoji: String(raw.weather.emoji || "").slice(0, 8),
          temp: Number.isFinite(Number(raw.weather.temp))
            ? Number(raw.weather.temp)
            : null,
          variant: String(raw.weather.variant || "").slice(0, 20),
          condition: String(raw.weather.condition || "").slice(0, 40),
        }
      : null,
  };
}
