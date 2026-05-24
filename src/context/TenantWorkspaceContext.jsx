"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const TenantWorkspaceContext = createContext(null);

export function TenantWorkspaceProvider({ children, initialWorkspace = null }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [loading, setLoading] = useState(!initialWorkspace);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/workspace/context", {
        suppressUnauthorizedEvent: true,
      });
      if (!res.ok) {
        setWorkspace(null);
        return;
      }
      const json = await getJsonOrThrow(res, "workspace context");
      setWorkspace(json.data || null);
    } catch {
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialWorkspace) {
      refresh();
    }
  }, [initialWorkspace, refresh]);

  const value = useMemo(
    () => ({
      workspace,
      loading,
      refresh,
      isPlatformMode: workspace?.mode === "platform",
      isContractorMode: workspace?.mode === "contractor",
      tenantCompanyName: workspace?.tenant?.companyName || "",
      platformName: workspace?.platform?.name || "FieldBase",
    }),
    [workspace, loading, refresh],
  );

  return (
    <TenantWorkspaceContext.Provider value={value}>
      {children}
    </TenantWorkspaceContext.Provider>
  );
}

export function useTenantWorkspace() {
  return useContext(TenantWorkspaceContext);
}
