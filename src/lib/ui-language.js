import { useCallback } from "react";
import { useTranslation } from "react-i18next";
// Ensure i18next is initialized (safe to import multiple times)
import "@/i18n";

export const SUPPORTED_UI_LANGUAGES = ["en", "es", "pl"];

/**
 * Kept for  backward compatibility.
 * Returns the current language from the global i18next instance so all
 * components that call this hook react instantly when any other component
 * calls i18n.changeLanguage().
 */
export function useStoredUiLanguage() {
  const { i18n } = useTranslation();
  const lang = SUPPORTED_UI_LANGUAGES.includes(i18n.language)
    ? i18n.language
    : "en";
  const setLanguage = useCallback(
    (newLang) => {
      if (SUPPORTED_UI_LANGUAGES.includes(newLang)) {
        i18n.changeLanguage(newLang);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("ui-language", newLang);
        }
        if (typeof document !== "undefined") {
          document.documentElement.lang = newLang;
        }
      }
    },
    [i18n],
  );
  return [lang, setLanguage];
}

/** @deprecated — direct localStorage access; use useStoredUiLanguage instead */
export function getStoredUiLanguage() {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem("ui-language");
  return SUPPORTED_UI_LANGUAGES.includes(stored) ? stored : "en";
}
