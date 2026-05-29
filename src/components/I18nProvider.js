"use client";

import { useEffect } from "react";
import "@/i18n";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import {
  applyUiLanguage,
  DEFAULT_UI_LANGUAGE,
  getStoredUiLanguage,
  UI_LANGUAGE_STORAGE_KEY,
} from "@/lib/ui-language";

export default function I18nProvider({ children }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (!stored) {
      window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, DEFAULT_UI_LANGUAGE);
    }

    // English by default; only Spanish or Polish when the user picks them in the sidebar.
    applyUiLanguage(getStoredUiLanguage());
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
