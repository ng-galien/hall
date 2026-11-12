import { type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { en } from "./en";
import { fr } from "./fr";
import { I18nContext, type I18nContextValue, type Locale } from "./i18nContext";
import { interpolateMessage, pluralMessage } from "./messageFormat";

export type { Locale } from "./i18nContext";

const STORAGE_KEY = "mairie.locale";

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "fr") return stored;
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** A date in words: day and month, and the year only when it is not the current year. */
function writtenDate(date: Date): Intl.DateTimeFormatOptions {
  return date.getFullYear() === new Date().getFullYear()
    ? { day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" };
}

// @implements-requirement HALL-FR-LAY-080
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
      t: (key, values) => interpolateMessage(messages[key], values),
      plural: (count, one, other) => pluralMessage(languageTag, count, messages[one], messages[other]),
      formatDate: (date) => new Intl.DateTimeFormat(languageTag, writtenDate(new Date(date))).format(new Date(date)),
      formatDateTime: (date) =>
        new Intl.DateTimeFormat(languageTag, {
          ...writtenDate(new Date(date)),
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(date)),
      formatTime: (date) =>
        new Intl.DateTimeFormat(languageTag, { hour: "2-digit", minute: "2-digit" }).format(new Date(date)),
      formatNumber: (number, options) => new Intl.NumberFormat(languageTag, options).format(number),
      formatDayMonth: (date) => ({
        day: new Intl.DateTimeFormat(languageTag, { day: "numeric" }).format(new Date(date)),
        month: new Intl.DateTimeFormat(languageTag, { month: "short" }).format(new Date(date)),
      }),
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
