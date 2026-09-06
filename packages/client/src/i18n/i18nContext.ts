import { createContext } from "react";
import type { TranslationKey } from "./en";

export type Locale = "en" | "fr";

export interface I18nContextValue {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: TranslationKey): string;
  formatDate(value: string | Date): string;
  formatDateTime(value: string | Date): string;
  formatTime(value: string | Date): string;
  formatNumber(value: number): string;
  formatFileSize(byteSize: number): string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
