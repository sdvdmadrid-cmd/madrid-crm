"use client";

import { useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  DEFAULT_CAPABILITIES,
  useAuthSession,
} from "@/context/AuthSessionContext";

export function useCurrentUserAccess() {
  const session = useAuthSession();
  const [fallbackUser, setFallbackUser] = useState(null);
  const [fallbackCapabilities, setFallbackCapabilities] =
    useState(DEFAULT_CAPABILITIES);

  // Outside AuthShell (rare): one fetch on mount only.
  useEffect(() => {
    if (session) return;
    let active = true;

    (async () => {
      try {
        const res = await apiFetch("/api/auth/me", {
          suppressUnauthorizedEvent: true,
        });
        const payload = await getJsonOrThrow(res, "Unable to load session");
        if (!active) return;
        setFallbackUser(payload?.data || null);
        setFallbackCapabilities(
          payload?.data?.capabilities || DEFAULT_CAPABILITIES,
        );
      } catch {
        if (!active) return;
        setFallbackUser(null);
        setFallbackCapabilities(DEFAULT_CAPABILITIES);
      }
    })();

    return () => {
      active = false;
    };
  }, [session]);

  if (session) {
    return {
      authUser: session.authUser,
      capabilities: session.capabilities,
    };
  }

  return { authUser: fallbackUser, capabilities: fallbackCapabilities };
}
