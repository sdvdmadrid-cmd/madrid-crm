"use client";

import { useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const DEFAULT_CAPABILITIES = {
  role: "worker",
  isSuperAdmin: false,
  isAdmin: false,
  isWorker: true,
  canReadTenantData: true,
  canWriteOperationalData: true,
  canDeleteRecords: false,
  canManageSensitiveData: false,
  canSendExternalCommunications: false,
};

export function useCurrentUserAccess() {
  const [authUser, setAuthUser] = useState(null);
  const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await apiFetch("/api/auth/me", {
          suppressUnauthorizedEvent: true,
        });
        const payload = await getJsonOrThrow(res, "Unable to load session");
        if (!active) return;
        setAuthUser(payload?.data || null);
        setCapabilities(payload?.data?.capabilities || DEFAULT_CAPABILITIES);
      } catch {
        if (!active) return;
        setAuthUser(null);
        setCapabilities(DEFAULT_CAPABILITIES);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { authUser, capabilities };
}
