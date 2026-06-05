"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-auth";

const INITIAL = { loaded: false, published: false, slug: null };
const CACHE_KEY = "fieldbase.website.publish-status";
const CACHE_TTL_MS = 5 * 60 * 1000;

let memoryCache = null;

function readCache() {
  if (memoryCache && memoryCache.expiresAt > Date.now()) {
    return memoryCache.data;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || parsed.expiresAt <= Date.now()) return null;
    memoryCache = parsed;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  const entry = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  memoryCache = entry;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}

/**
 * Lightweight publish state for nav links (live /sites/{slug} vs builder /website).
 */
export function usePublishedWebsiteStatus(enabled = true) {
  const [status, setStatus] = useState(() => {
    if (!enabled) return INITIAL;
    return readCache() || INITIAL;
  });

  useEffect(() => {
    if (!enabled) {
      setStatus(INITIAL);
      return;
    }

    const cached = readCache();
    if (cached?.loaded) {
      setStatus(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/website-builder/publish-status", {
          cache: "no-store",
          suppressUnauthorizedEvent: true,
        });
        if (!res.ok) {
          const fallback = { loaded: true, published: false, slug: null };
          if (!cancelled) setStatus(fallback);
          writeCache(fallback);
          return;
        }
        const payload = await res.json().catch(() => null);
        const next = {
          loaded: true,
          published: Boolean(payload?.data?.published),
          slug: payload?.data?.slug ? String(payload.data.slug).trim() : null,
        };
        if (cancelled) return;
        setStatus(next);
        writeCache(next);
      } catch {
        const fallback = { loaded: true, published: false, slug: null };
        if (!cancelled) setStatus(fallback);
        writeCache(fallback);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return status;
}
