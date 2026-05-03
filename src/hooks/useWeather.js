"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/client-auth";
import { formatLocalDate, parseYmdToLocalDate, todayLocalYmd } from "@/lib/local-date";

// ─── Client-side in-memory cache (survives re-renders, cleared on page refresh)
const clientCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCached(key) {
  const entry = clientCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    clientCache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setClientCache(key, data) {
  clientCache.set(key, { ts: Date.now(), data });
}

// Stable map key
export function weatherKey(location, date) {
  if (!location || !date) return null;
  return `${String(location).toLowerCase().trim()}::${date}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWeather(
  appointments,
  { calendarDays = [], defaultLocation = "", forecastDates = [] } = {},
) {
  const [weatherMap, setWeatherMap] = useState(new Map());
  const fetchingRef = useRef(new Set()); // Prevents duplicate in-flight requests

  const fetchOne = useCallback(async (location, date) => {
    const key = weatherKey(location, date);
    if (!key || fetchingRef.current.has(key)) return;

    // Serve from client cache if fresh
    const cached = getCached(key);
    if (cached !== undefined) {
      setWeatherMap((prev) => {
        if (prev.get(key) === cached) return prev;
        const next = new Map(prev);
        next.set(key, cached);
        return next;
      });
      return;
    }

    fetchingRef.current.add(key);
    try {
      const params = new URLSearchParams({ location, date });
      const res = await apiFetch(`/api/weather?${params}`);
      if (!res.ok) {
        // Avoid hammering the endpoint on repeated renders when weather is unavailable.
        setClientCache(key, null);
        setWeatherMap((prev) => {
          const next = new Map(prev);
          next.set(key, null);
          return next;
        });
        return;
      }
      const data = await res.json();
      setClientCache(key, data);
      setWeatherMap((prev) => {
        const next = new Map(prev);
        next.set(key, data);
        return next;
      });
    } catch (err) {
      console.warn("[useWeather] failed for", key, err.message);
    } finally {
      fetchingRef.current.delete(key);
    }
  }, []);

  // Fetch weather for each appointment that has a location
  useEffect(() => {
    if (!appointments || appointments.length === 0) return;
    const seen = new Set();
    const pairs = [];
    for (const apt of appointments) {
      if (!apt.location || !apt.date) continue;
      const key = weatherKey(apt.location, apt.date);
      if (key && !seen.has(key)) {
        seen.add(key);
        pairs.push({ location: apt.location, date: apt.date });
      }
    }
    for (const { location, date } of pairs) {
      fetchOne(location, date);
    }
  }, [appointments, fetchOne]);

  // Fetch day-level weather for every visible calendar day using defaultLocation
  useEffect(() => {
    if (!defaultLocation || !calendarDays || calendarDays.length === 0) return;
    const today = todayLocalYmd();
    const maxForecastDate = formatLocalDate(
      new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate() + 15,
      ),
    );
    for (const { date } of calendarDays) {
      if (!date) continue;
      const dateStr = formatLocalDate(date);
      if (!dateStr || dateStr < today || dateStr > maxForecastDate) continue;
      fetchOne(defaultLocation, dateStr);
    }
  }, [calendarDays, defaultLocation, fetchOne]);

  // Fetch explicit forecast dates so weather appears without depending on appointments.
  useEffect(() => {
    if (!defaultLocation || !forecastDates || forecastDates.length === 0) return;
    for (const date of forecastDates) {
      if (!date) continue;
      fetchOne(defaultLocation, date);
    }
  }, [defaultLocation, fetchOne, forecastDates]);

  const getWeather = useCallback(
    (location, date) => {
      const key = weatherKey(location, date);
      if (!key) return null;
      return weatherMap.get(key) ?? null;
    },
    [weatherMap],
  );

  const getDayWeather = useCallback(
    (date) => {
      if (!defaultLocation || !date) return null;
      const dateStr =
        typeof date === "string"
          ? date
          : formatLocalDate(date instanceof Date ? date : parseYmdToLocalDate(date));
      return weatherMap.get(weatherKey(defaultLocation, dateStr)) ?? null;
    },
    [weatherMap, defaultLocation],
  );

  return { weatherMap, getWeather, getDayWeather };
}
