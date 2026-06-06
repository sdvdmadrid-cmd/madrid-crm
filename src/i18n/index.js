import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

const loadedLocales = new Set(["en"]);

const localeLoaders = {
  es: () => import("./locales/es.json"),
  pl: () => import("./locales/pl.json"),
};

/** Load es/pl on demand so the initial bundle ships English only. */
export async function ensureLocaleLoaded(lang) {
  const code = String(lang || "en").split("-")[0];
  if (code === "en" || loadedLocales.has(code)) {
    return;
  }

  const load = localeLoaders[code];
  if (!load) {
    return;
  }

  const mod = await load();
  const bundle = mod.default || mod;
  i18n.addResourceBundle(code, "translation", bundle, true, true);
  loadedLocales.add(code);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
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
