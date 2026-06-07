"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-auth";

const memoryStore = new Map();

function readEntry(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry;
}

function writeEntry(key, data, ttlMs) {
  memoryStore.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Client-side TTL cache for read-only API GETs (dashboard satellites, etc.).
 * Returns cached data immediately when warm; optionally revalidates in background.
 */
export function useCachedApiFetch(
  key,
  url,
  {
    ttlMs = 90_000,
    enabled = true,
    revalidate = true,
    parseJson = true,
    fetchOptions = {},
  } = {},
) {
  const [data, setData] = useState(() => {
    if (!enabled) return null;
    return readEntry(key)?.data ?? null;
  });
  const [loading, setLoading] = useState(() => {
    if (!enabled) return false;
    return !readEntry(key);
  });
  const [error, setError] = useState("");
  const inflightRef = useRef(null);

  const fetchFresh = useCallback(
    async ({ background = false } = {}) => {
      if (!enabled || !url) return null;

      if (inflightRef.current) {
        return inflightRef.current;
      }

      if (!background) {
        setLoading(true);
        setError("");
      }

      const promise = (async () => {
        try {
          const res = await apiFetch(url, {
            cache: "no-store",
            suppressUnauthorizedEvent: true,
            ...fetchOptions,
          });
          if (!res.ok) {
            throw new Error(`Request failed (${res.status})`);
          }
          const payload = parseJson ? await res.json() : res;
          writeEntry(key, payload, ttlMs);
          setData(payload);
          setError("");
          return payload;
        } catch (err) {
          if (!background) {
            setError(err?.message || "Request failed");
          }
          return null;
        } finally {
          if (!background) setLoading(false);
          inflightRef.current = null;
        }
      })();

      inflightRef.current = promise;
      return promise;
    },
    [enabled, fetchOptions, key, parseJson, ttlMs, url],
  );

  useEffect(() => {
    if (!enabled || !url) {
      setData(null);
      setLoading(false);
      return;
    }

    const cached = readEntry(key);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      if (revalidate) {
        void fetchFresh({ background: true });
      }
      return;
    }

    void fetchFresh({ background: false });
  }, [enabled, fetchFresh, key, revalidate, url]);

  const refresh = useCallback(() => fetchFresh({ background: false }), [fetchFresh]);

  return { data, loading, error, refresh };
}

export function clearCachedApiFetch(key) {
  memoryStore.delete(key);
}
