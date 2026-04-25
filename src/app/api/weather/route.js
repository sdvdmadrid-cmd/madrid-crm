import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";

// ─── Server-side in-memory cache ─────────────────────────────────────────────
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
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
  // Prevent unbounded growth
  if (weatherCache.size > 500) {
    const firstKey = weatherCache.keys().next().value;
    weatherCache.delete(firstKey);
  }
  weatherCache.set(key, { ts: Date.now(), data });
}

// ─── Weather code helpers ─────────────────────────────────────────────────────
function getWeatherEmoji(code) {
  const c = String(code);
  if (c.startsWith("2")) return "⛈️";
  if (c.startsWith("3")) return "🌦️";
  if (c.startsWith("5")) return "🌧️";
  if (c.startsWith("6")) return "❄️";
  if (c.startsWith("7")) return "🌫️";
  if (c === "800") return "☀️";
  if (c.startsWith("8")) return "⛅";
  return "🌡️";
}

function getWeatherVariant(code) {
  const c = String(code);
  if (c.startsWith("2")) return "storm";
  if (c.startsWith("3") || c.startsWith("5")) return "rain";
  if (c.startsWith("6")) return "snow";
  if (c.startsWith("7")) return "mist";
  if (c === "800") return "clear";
  if (c.startsWith("8")) return "clouds";
  return "default";
}

// ─── Route ───────────────────────────────────────────────────────────────────
export async function GET(request) {
  const { authenticated } = await getAuthenticatedTenantContext(request);
  if (!authenticated) return unauthenticatedResponse();

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENWEATHER_API_KEY not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const { searchParams } = new URL(request.url);
  const location = (searchParams.get("location") || "").trim();
  const date = (searchParams.get("date") || "").trim(); // YYYY-MM-DD

  if (!location || !date) {
    return new Response(
      JSON.stringify({ error: "location and date are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Check server cache
  const cacheKey = `${location.toLowerCase()}::${date}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  // Only serve dates within today → +5 days (OpenWeather free tier)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date + "T12:00:00");
  const maxForecastDate = new Date(today);
  maxForecastDate.setDate(today.getDate() + 5);

  if (targetDate < today || targetDate > maxForecastDate) {
    // Out of forecast range – not an error, just no data
    const empty = null;
    setCache(cacheKey, empty);
    return new Response(JSON.stringify(empty), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodedLocation}&appid=${apiKey}&units=imperial&cnt=40`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("[api/weather] OpenWeather error", res.status, errBody);
      return new Response(
        JSON.stringify({ error: "Weather service unavailable" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    const list = data.list || [];

    // Find forecast entry closest to noon on the target date
    const targetNoon = new Date(date + "T12:00:00").getTime();
    let closest = null;
    let closestDiff = Infinity;

    for (const entry of list) {
      const diff = Math.abs(entry.dt * 1000 - targetNoon);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = entry;
      }
    }

    if (!closest) {
      setCache(cacheKey, null);
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const weatherCode = closest.weather[0]?.id ?? 800;
    const result = {
      emoji: getWeatherEmoji(weatherCode),
      variant: getWeatherVariant(weatherCode),
      temp: Math.round(closest.main.temp),
      feelsLike: Math.round(closest.main.feels_like),
      condition: closest.weather[0]?.main || "Clear",
      description: closest.weather[0]?.description || "",
      humidity: closest.main.humidity,
      windSpeed: Math.round(closest.wind?.speed ?? 0),
      icon: closest.weather[0]?.icon,
    };

    setCache(cacheKey, result);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("[api/weather] fetch error", err.message);
    return new Response(JSON.stringify({ error: "Weather fetch failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
