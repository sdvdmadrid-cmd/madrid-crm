"use client";

import { createContext, useContext } from "react";

const WebsiteBuilderEditContext = createContext(null);

export function WebsiteBuilderEditProvider({ children, editingRef }) {
  return (
    <WebsiteBuilderEditContext.Provider value={editingRef}>
      {children}
    </WebsiteBuilderEditContext.Provider>
  );
}

export function useWebsiteBuilderEditingRef() {
  return useContext(WebsiteBuilderEditContext);
}
