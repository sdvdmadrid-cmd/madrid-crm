import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";
import { formatLocalDate, isValidYmd, parseYmdToLocalDate, todayLocalYmd } from "@/lib/local-date";

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_FORECAST_DAYS = 15;
const WEATHER_CACHE_VERSION = "v2";
const weatherCache = new Map();

function getCached(key) {
  const entry = weatherCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    weatherCache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key, data) {
  if (weatherCache.size > 500) {
    const firstKey = weatherCache.keys().next().value;
    weatherCache.delete(firstKey);
  }
  weatherCache.set(key, { ts: Date.now(), data });
}

function getWeatherEmoji(code, isDay = true) {
  const n = Number(code);
  if (Number.isNaN(n)) return "\u{1F321}\uFE0F";
  if (n >= 95) return "\u26C8\uFE0F";
  if ((n >= 51 && n <= 67) || (n >= 80 && n <= 82)) return "\u{1F327}\uFE0F";
  if (n >= 71 && n <= 77) return "\u2744\uFE0F";
  if (n === 45 || n === 48) return "\u{1F32B}\uFE0F";
  if (n === 0 || n === 1) return isDay ? "\u2600\uFE0F" : "\u{1F319}";
  if (n === 2) return isDay ? "\u26C5" : "\u2601\uFE0F";
  if (n === 3) return "\u2601\uFE0F";
  return "\u{1F321}\uFE0F";
}

function isDaytimeHour(hour) {
  return hour >= 6 && hour < 18;
}

function getWeatherVariant(code) {
  const n = Number(code);
  if (Number.isNaN(n)) return "default";
  if (n >= 95) return "storm";
  if ((n >= 51 && n <= 67) || (n >= 80 && n <= 82)) return "rain";
  if (n >= 71 && n <= 77) return "snow";
  if (n === 45 || n === 48) return "mist";
  if (n === 0 || n === 1) return "clear";
  if (n >= 2 && n <= 3) return "clouds";
  return "default";
}

function weatherCodeToLabel(code) {
  const n = Number(code);
  if (n === 0) return { condition: "Clear", description: "clear sky" };
  if (n === 1) return { condition: "Clear", description: "mostly clear" };
  if (n === 2) return { condition: "Clouds", description: "partly cloudy" };
  if (n === 3) return { condition: "Clouds", description: "overcast" };
  if (n === 45 || n === 48) return { condition: "Mist", description: "fog" };
  if (n >= 51 && n <= 67) return { condition: "Rain", description: "rain" };
  if (n >= 71 && n <= 77) return { condition: "Snow", description: "snow" };
  if (n >= 80 && n <= 82) return { condition: "Rain", description: "rain showers" };
  if (n >= 95) return { condition: "Storm", description: "thunderstorm" };
  return { condition: "Clear", description: "clear sky" };
}

function buildFallbackWeather(location, date) {
  const seed = Array.from(`${location}|${date}`).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const patterns = [
    { code: 0, condition: "Clear", description: "clear sky" },
    { code: 2, condition: "Clouds", description: "partly cloudy" },
    { code: 61, condition: "Rain", description: "light rain" },
    { code: 45, condition: "Mist", description: "mist" },
  ];
  const selected = patterns[seed % patterns.length];
  const baseTemp = 55 + (seed % 18);
  return {
    emoji: getWeatherEmoji(selected.code),
    variant: getWeatherVariant(selected.code),
    temp: baseTemp,
    feelsLike: baseTemp - 2,
    condition: selected.condition,
    description: selected.description,
    humidity: 45 + (seed % 40),
    windSpeed: 4 + (seed % 18),
    icon: null,
    hourly: [],
    fallback: true,
  };
}

function buildFallbackHourly(date, seedBase = 0) {
  const targetDate = parseYmdToLocalDate(date);
  if (!targetDate) return [];
  const rows = [];
  for (let hour = 0; hour < 24; hour += 3) {
    const seed = seedBase + hour;
    const temp = 52 + (seed % 16);
    const code = [0, 2, 61, 45][seed % 4];
    const stamp = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      hour,
      0,
      0,
      0,
    );
    const weatherText = weatherCodeToLabel(code);
    rows.push({
      time: stamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      hour,
      temp,
      feelsLike: temp - 2,
      condition: weatherText.condition,
      description: weatherText.description,
      humidity: 45 + (seed % 35),
      windSpeed: 4 + (seed % 17),
      variant: getWeatherVariant(code),
      isDay: isDaytimeHour(hour),
      emoji: getWeatherEmoji(code, isDaytimeHour(hour)),
    });
  }
  return rows;
}

function buildHourlyFromOpenMeteo(hourly, date) {
  const rows = [];
  const times = hourly?.time || [];
  for (let i = 0; i < times.length; i += 1) {
    const timeLabel = String(times[i] || "");
    if (!timeLabel.startsWith(`${date}T`)) continue;
    const stamp = new Date(timeLabel);
    const code = Number(hourly?.weathercode?.[i] ?? 0);
    const isDay = Number(hourly?.is_day?.[i] ?? (isDaytimeHour(stamp.getHours()) ? 1 : 0)) === 1;
    const weatherText = weatherCodeToLabel(code);
    rows.push({
      time: stamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      hour: stamp.getHours(),
      temp: Math.round(Number(hourly?.temperature_2m?.[i] ?? 0)),
      feelsLike: Math.round(Number(hourly?.apparent_temperature?.[i] ?? 0)),
      condition: weatherText.condition,
      description: weatherText.description,
      humidity: Number(hourly?.relative_humidity_2m?.[i] ?? 0),
      windSpeed: Math.round(Number(hourly?.windspeed_10m?.[i] ?? 0)),
      variant: getWeatherVariant(code),
      isDay,
      emoji: getWeatherEmoji(code, isDay),
    });
  }
  return rows;
}

async function geocodeLocation(location) {
  const coordMatch = location.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordMatch) {
    return {
      latitude: Number(coordMatch[1]),
      longitude: Number(coordMatch[2]),
      name: location,
    };
  }

  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) return null;
  const payload = await res.json().catch(() => null);
  const first = payload?.results?.[0];
  if (!first) return null;
  return {
    latitude: Number(first.latitude),
    longitude: Number(first.longitude),
    name: first.name || location,
  };
}

export async function GET(request) {
  const { authenticated } = await getAuthenticatedTenantContext(request);
  if (!authenticated) return unauthenticatedResponse();

  const { searchParams } = new URL(request.url);
  const location = (searchParams.get("location") || "").trim();
  const date = (searchParams.get("date") || "").trim();

  if (!location || !date) {
    return new Response(
      JSON.stringify({ error: "location and date are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!isValidYmd(date)) {
    return new Response(
      JSON.stringify({ error: "date must be in YYYY-MM-DD format" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const cacheKey = `${WEATHER_CACHE_VERSION}::${location.toLowerCase()}::${date}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  const today = todayLocalYmd();
  const maxForecastDate = formatLocalDate(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + MAX_FORECAST_DAYS),
  );

  if (date < today || date > maxForecastDate) {
    const empty = null;
    setCache(cacheKey, empty);
    return new Response(JSON.stringify(empty), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const geocode = await geocodeLocation(location);
    if (!geocode) {
      setCache(cacheKey, null);
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(geocode.latitude)}&longitude=${encodeURIComponent(geocode.longitude)}&daily=weathercode,temperature_2m_max,temperature_2m_min,apparent_temperature_max,relative_humidity_2m_mean,windspeed_10m_max&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,windspeed_10m,weathercode,is_day&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=16`,
      { signal: AbortSignal.timeout(7000) },
    );

    if (!res.ok) {
      throw new Error(`Open-Meteo error ${res.status}`);
    }

    const data = await res.json();
    const dailyTimes = Array.isArray(data?.daily?.time) ? data.daily.time : [];
    const targetIndex = dailyTimes.findIndex((d) => d === date);

    if (targetIndex < 0) {
      setCache(cacheKey, null);
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const weatherCode = Number(data.daily.weathercode?.[targetIndex] ?? 0);
    const weatherText = weatherCodeToLabel(weatherCode);
    const maxTemp = Number(data.daily.temperature_2m_max?.[targetIndex] ?? 0);
    const minTemp = Number(data.daily.temperature_2m_min?.[targetIndex] ?? 0);
    const avgTemp = Number.isFinite(maxTemp) && Number.isFinite(minTemp)
      ? (maxTemp + minTemp) / 2
      : maxTemp;

    const result = {
      emoji: getWeatherEmoji(weatherCode),
      variant: getWeatherVariant(weatherCode),
      temp: Math.round(avgTemp),
      feelsLike: Math.round(Number(data.daily.apparent_temperature_max?.[targetIndex] ?? avgTemp)),
      condition: weatherText.condition,
      description: weatherText.description,
      humidity: Math.round(Number(data.daily.relative_humidity_2m_mean?.[targetIndex] ?? 0)),
      windSpeed: Math.round(Number(data.daily.windspeed_10m_max?.[targetIndex] ?? 0)),
      icon: null,
      hourly: buildHourlyFromOpenMeteo(data.hourly, date),
    };

    setCache(cacheKey, result);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("[api/weather] fetch error", err.message);
    const fallback = buildFallbackWeather(location, date);
    fallback.hourly = buildFallbackHourly(
      date,
      Array.from(`${location}|${date}`).reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
    );
    setCache(cacheKey, fallback);
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Weather-Fallback": "1" },
    });
  }
}
