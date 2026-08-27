import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { en, type TranslationKey } from "./en";
import { fr } from "./fr";

export type Locale = "en" | "fr";

interface I18nContextValue {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: TranslationKey): string;
  formatDate(value: string | Date): string;
  formatDateTime(value: string | Date): string;
  formatTime(value: string | Date): string;
  formatNumber(value: number): string;
  formatFileSize(byteSize: number): string;
}

const STORAGE_KEY = "mairie.locale";
const I18nContext = createContext<I18nContextValue | null>(null);

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "fr") return stored;
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.title = (locale === "fr" ? fr : en)["app.windowTitle"];
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const messages = locale === "fr" ? fr : en;
    const languageTag = locale === "fr" ? "fr-FR" : "en-GB";
    return {
      locale,
      setLocale,
      t: (key) => messages[key],
      formatDate: (date) => new Date(date).toLocaleDateString(languageTag),
      formatDateTime: (date) => new Date(date).toLocaleString(languageTag),
      formatTime: (date) =>
        new Intl.DateTimeFormat(languageTag, { hour: "2-digit", minute: "2-digit" }).format(new Date(date)),
      formatNumber: (number) => new Intl.NumberFormat(languageTag).format(number),
      formatFileSize: (byteSize) =>
        new Intl.NumberFormat(languageTag, {
          style: "unit",
          unit: "kilobyte",
          unitDisplay: "short",
          maximumFractionDigits: 1,
        }).format(byteSize / 1024),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
