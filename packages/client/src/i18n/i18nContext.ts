import { createContext } from "react";
import type { TranslationKey } from "./en";
import type { MessageValues } from "./messageFormat";

export type Locale = "en" | "fr";

export interface I18nContextValue {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: TranslationKey, values?: MessageValues): string;
  plural(count: number, one: TranslationKey, other: TranslationKey): string;
  formatDate(value: string | Date): string;
  formatDateTime(value: string | Date): string;
  formatTime(value: string | Date): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatFileSize(byteSize: number): string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
