import { useCallback } from "react";
import { useTranslation } from "react-i18next";
// Ensure i18next is initialized (safe to import multiple times)
import "@/i18n";
import i18n, { ensureLocaleLoaded } from "@/i18n";

export const SUPPORTED_UI_LANGUAGES = ["en", "es", "pl"];
export const UI_LANGUAGE_STORAGE_KEY = "ui-language";
export const DEFAULT_UI_LANGUAGE = "en";

/** @param {string} lang */
export function resolveUiLanguage(lang) {
  const base = String(lang || "").split("-")[0];
  return SUPPORTED_UI_LANGUAGES.includes(base) ? base : DEFAULT_UI_LANGUAGE;
}

/** @param {string} lang */
export async function applyUiLanguage(lang) {
  const resolved = resolveUiLanguage(lang);
  await ensureLocaleLoaded(resolved);
  i18n.changeLanguage(resolved);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, resolved);
    document.documentElement.lang = resolved;
  }
  return resolved;
}

/**
 * Kept for backward compatibility.
 * Returns the current language from the global i18next instance so all
 * components that call this hook react instantly when any other component
 * calls i18n.changeLanguage().
 */
export function useStoredUiLanguage() {
  const { i18n: i18nInstance } = useTranslation();
  const lang = resolveUiLanguage(i18nInstance.language);
  const setLanguage = useCallback((newLang) => {
    void applyUiLanguage(newLang);
  }, []);
  return [lang, setLanguage];
}

/** @deprecated — direct localStorage access; use useStoredUiLanguage instead */
export function getStoredUiLanguage() {
  if (typeof window === "undefined") return DEFAULT_UI_LANGUAGE;
  const stored = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
  return resolveUiLanguage(stored);
}
