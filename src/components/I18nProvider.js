"use client";

import { useEffect } from "react";
import "@/i18n";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";

const SUPPORTED = ["en", "es", "pl"];
const STORAGE_KEY = "ui-language";

export default function I18nProvider({ children }) {
  useEffect(() => {
    // Apply the stored language after hydration. Server and initial client
    // render both use "en" (no mismatch), then this effect instantly switches
    // to the user's saved preference.
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const lang = SUPPORTED.includes(stored) ? stored : "en";
    if (lang !== i18n.language) {
      i18n.changeLanguage(lang);
    }
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
