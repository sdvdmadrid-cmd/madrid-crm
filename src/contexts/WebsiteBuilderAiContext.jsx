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

  const generateHeroImage = useCallback((payload) => {
    return apiRef.current?.generateHeroImage?.(payload);
  }, []);

  const generateHeroImagesBatch = useCallback((payload) => {
    return apiRef.current?.generateHeroImagesBatch?.(payload);
  }, []);

  const generateGalleryImages = useCallback((payload) => {
    return apiRef.current?.generateGalleryImages?.(payload);
  }, []);

  const removeGalleryImage = useCallback((payload) => {
    return apiRef.current?.removeGalleryImage?.(payload);
  }, []);

  const removeHeroImage = useCallback((payload) => {
    return apiRef.current?.removeHeroImage?.(payload);
  }, []);

  const value = useMemo(
    () => ({
      registerBuilder,
      unregisterBuilder,
      getSnapshot,
      applyPatches,
      runGenerateFull,
      generateHeroImage,
      generateHeroImagesBatch,
      generateGalleryImages,
      removeGalleryImage,
      removeHeroImage,
      isActive: () => Boolean(apiRef.current),
    }),
    [
      registerBuilder,
      unregisterBuilder,
      getSnapshot,
      applyPatches,
      runGenerateFull,
      generateHeroImage,
      generateHeroImagesBatch,
      generateGalleryImages,
      removeGalleryImage,
      removeHeroImage,
    ],
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
