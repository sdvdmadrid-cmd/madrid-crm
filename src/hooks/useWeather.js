"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/client-auth";
import { formatLocalDate, parseYmdToLocalDate, todayLocalYmd } from "@/lib/local-date";

const clientCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_APPOINTMENT_WEATHER = 12;
const MAX_CALENDAR_DAY_WEATHER = 8;
const BATCH_FLUSH_MS = 40;

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

export function weatherKey(location, date) {
  if (!location || !date) return null;
  return `${String(location).toLowerCase().trim()}::${date}`;
}

export function useWeather(
  appointments,
  { calendarDays = [], defaultLocation = "", forecastDates = [] } = {},
) {
  const [weatherMap, setWeatherMap] = useState(new Map());
  const pendingBatchRef = useRef(new Map());
  const batchTimerRef = useRef(null);
  const inflightBatchRef = useRef(null);

  const applyResults = useCallback((entries) => {
    if (!entries || entries.length === 0) return;
    setWeatherMap((prev) => {
      const next = new Map(prev);
      for (const [key, data] of entries) {
        next.set(key, data);
      }
      return next;
    });
  }, []);

  const flushBatch = useCallback(async () => {
    if (inflightBatchRef.current) {
      await inflightBatchRef.current;
      return;
    }

    const items = [...pendingBatchRef.current.values()];
    pendingBatchRef.current.clear();
    if (items.length === 0) return;

    const uncached = items.filter((item) => {
      const key = weatherKey(item.location, item.date);
      return key && getCached(key) === undefined;
    });

    for (const item of items) {
      const key = weatherKey(item.location, item.date);
      const cached = key ? getCached(key) : undefined;
      if (key && cached !== undefined) {
        applyResults([[key, cached]]);
      }
    }

    if (uncached.length === 0) return;

    inflightBatchRef.current = (async () => {
      try {
        const res = await apiFetch("/api/weather/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: uncached }),
        });
        if (!res.ok) {
          for (const item of uncached) {
            const key = weatherKey(item.location, item.date);
            if (!key) continue;
            setClientCache(key, null);
            applyResults([[key, null]]);
          }
          return;
        }
        const payload = await res.json();
        const results = payload?.results || {};
        const entries = [];
        for (const item of uncached) {
          const key = weatherKey(item.location, item.date);
          const resultKey = key;
          const clientKey = `${String(item.location).toLowerCase().trim()}::${item.date}`;
          const data = results[clientKey] ?? results[resultKey] ?? null;
          if (key) {
            setClientCache(key, data);
            entries.push([key, data]);
          }
        }
        applyResults(entries);
      } catch (err) {
        console.warn("[useWeather] batch failed", err.message);
      } finally {
        inflightBatchRef.current = null;
      }
    })();

    await inflightBatchRef.current;
  }, [applyResults]);

  const enqueueWeather = useCallback(
    (location, date) => {
      const key = weatherKey(location, date);
      if (!key) return;

      const cached = getCached(key);
      if (cached !== undefined) {
        applyResults([[key, cached]]);
        return;
      }

      pendingBatchRef.current.set(key, { location, date });
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
      batchTimerRef.current = setTimeout(() => {
        void flushBatch();
      }, BATCH_FLUSH_MS);
    },
    [applyResults, flushBatch],
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

  useEffect(
    () => () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    },
    [],
  );

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
