"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";

const WebsiteBuilderAiContext = createContext(null);

/**
 * Bridges Website Builder state to the global AI bubble on /website routes.
 */
export function WebsiteBuilderAiProvider({ children }) {
  const apiRef = useRef(null);

  const registerBuilder = useCallback((api) => {
    apiRef.current = api;
  }, []);

  const unregisterBuilder = useCallback(() => {
    apiRef.current = null;
  }, []);

  const getSnapshot = useCallback(() => apiRef.current?.getSnapshot?.() ?? null, []);

  const applyPatches = useCallback((patches) => {
    return apiRef.current?.applyPatches?.(patches);
  }, []);

  const runGenerateFull = useCallback(() => {
    return apiRef.current?.runGenerateFull?.();
  }, []);

  const value = useMemo(
    () => ({
      registerBuilder,
      unregisterBuilder,
      getSnapshot,
      applyPatches,
      runGenerateFull,
      isActive: () => Boolean(apiRef.current),
    }),
    [registerBuilder, unregisterBuilder, getSnapshot, applyPatches, runGenerateFull],
  );

  return (
    <WebsiteBuilderAiContext.Provider value={value}>
      {children}
    </WebsiteBuilderAiContext.Provider>
  );
}

export function useWebsiteBuilderAi() {
  return useContext(WebsiteBuilderAiContext);
}
