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
  // English is the product default. I18nProvider applies a stored choice
  // (es/pl) only after the user selects it in the sidebar — never the browser locale.
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
