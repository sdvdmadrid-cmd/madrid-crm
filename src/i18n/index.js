import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";
import pl from "./locales/pl.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    pl: { translation: pl },
  },
  // Always start with "en" on both server and client so SSR and hydration
  // match. I18nProvider applies the stored user preference after mount.
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ["en", "es", "pl"],
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
