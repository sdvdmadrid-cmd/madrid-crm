"use client";

// Color variants per weather condition
const variantStyles = {
  clear:   "bg-amber-50  text-amber-700  border-amber-200",
  rain:    "bg-blue-50   text-blue-700   border-blue-200",
  storm:   "bg-purple-50 text-purple-700 border-purple-200",
  snow:    "bg-sky-50    text-sky-700    border-sky-200",
  mist:    "bg-slate-50  text-slate-600  border-slate-200",
  clouds:  "bg-gray-50   text-gray-600   border-gray-200",
  default: "bg-gray-50   text-gray-500   border-gray-200",
};

/**
 * WeatherBadge — shows weather for a specific location+date on an appointment card.
 *
 * Props:
 *  weather  – Object returned by the /api/weather route (or null)
 *  compact  – If true, shows only emoji + temp (for inline event cards)
 */
export default function WeatherBadge({ weather, compact = false }) {
  if (!weather) return null;

  const style = variantStyles[weather.variant] ?? variantStyles.default;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium leading-tight ${style}`}
        title={`${weather.description ? weather.description.charAt(0).toUpperCase() + weather.description.slice(1) : weather.condition} · ${weather.temp}°F · Humidity ${weather.humidity}%`}
      >
        <span aria-hidden="true">{weather.emoji}</span>
        <span>{weather.temp}°</span>
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium ${style}`}
    >
      <span className="text-base leading-none" aria-hidden="true">
        {weather.emoji}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-semibold">{weather.temp}°F</span>
        <span className="opacity-75 capitalize text-[11px]">
          {weather.description || weather.condition}
        </span>
      </div>
      {weather.windSpeed > 0 && (
        <span className="text-[10px] opacity-60 ml-1">
          💨 {weather.windSpeed} mph
        </span>
      )}
    </div>
  );
}
