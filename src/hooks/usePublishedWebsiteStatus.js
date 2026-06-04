"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-auth";

const INITIAL = { loaded: false, published: false, slug: null };

/**
 * Lightweight publish state for nav links (live /sites/{slug} vs builder /website).
 */
export function usePublishedWebsiteStatus(enabled = true) {
  const [status, setStatus] = useState(INITIAL);

  useEffect(() => {
    if (!enabled) {
      setStatus(INITIAL);
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
          if (!cancelled) setStatus({ loaded: true, published: false, slug: null });
          return;
        }
        const payload = await res.json().catch(() => null);
        if (cancelled) return;
        setStatus({
          loaded: true,
          published: Boolean(payload?.data?.published),
          slug: payload?.data?.slug ? String(payload.data.slug).trim() : null,
        });
      } catch {
        if (!cancelled) setStatus({ loaded: true, published: false, slug: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return status;
}
