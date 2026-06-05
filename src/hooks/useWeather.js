"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/client-auth";
import { formatLocalDate, parseYmdToLocalDate, todayLocalYmd } from "@/lib/local-date";

// ─── Client-side in-memory cache (survives re-renders, cleared on page refresh)
const clientCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_WEATHER_IN_FLIGHT = 4;
const MAX_APPOINTMENT_WEATHER = 12;
const MAX_CALENDAR_DAY_WEATHER = 8;

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
  const fetchingRef = useRef(new Set());
  const queueRef = useRef([]);
  const activeRef = useRef(0);

  const fetchOne = useCallback(async (location, date) => {
    const key = weatherKey(location, date);
    if (!key || fetchingRef.current.has(key)) return;

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

  const pumpQueue = useCallback(() => {
    while (activeRef.current < MAX_WEATHER_IN_FLIGHT && queueRef.current.length > 0) {
      const { location, date } = queueRef.current.shift();
      const key = weatherKey(location, date);
      if (!key || fetchingRef.current.has(key) || getCached(key) !== undefined) {
        continue;
      }
      activeRef.current += 1;
      fetchOne(location, date).finally(() => {
        activeRef.current -= 1;
        pumpQueue();
      });
    }
  }, [fetchOne]);

  const enqueueWeather = useCallback(
    (location, date) => {
      const key = weatherKey(location, date);
      if (!key) return;
      queueRef.current.push({ location, date });
      pumpQueue();
    },
    [pumpQueue],
  );

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
    for (const { location, date } of pairs.slice(0, MAX_APPOINTMENT_WEATHER)) {
      enqueueWeather(location, date);
    }
  }, [appointments, enqueueWeather]);

  useEffect(() => {
    if (!defaultLocation || !calendarDays || calendarDays.length === 0) return;
    const today = todayLocalYmd();
    const maxForecastDate = formatLocalDate(
      new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate() + 7,
      ),
    );
    let queued = 0;
    for (const { date, isCurrentMonth } of calendarDays) {
      if (queued >= MAX_CALENDAR_DAY_WEATHER) break;
      if (!date || isCurrentMonth === false) continue;
      const dateStr = formatLocalDate(date);
      if (!dateStr || dateStr < today || dateStr > maxForecastDate) continue;
      enqueueWeather(defaultLocation, dateStr);
      queued += 1;
    }
  }, [calendarDays, defaultLocation, enqueueWeather]);

  useEffect(() => {
    if (!defaultLocation || !forecastDates || forecastDates.length === 0) return;
    for (const date of forecastDates.slice(0, MAX_CALENDAR_DAY_WEATHER)) {
      if (!date) continue;
      enqueueWeather(defaultLocation, date);
    }
  }, [defaultLocation, enqueueWeather, forecastDates]);

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
