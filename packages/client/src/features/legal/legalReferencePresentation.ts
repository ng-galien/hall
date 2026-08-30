import type { TranslationKey } from "../../i18n/en";

const statusKeys: Partial<Record<string, TranslationKey>> = {
  VIGUEUR: "legalReference.status.current",
  ABROGE: "legalReference.status.repealed",
  PERIME: "legalReference.status.expired",
  VIGUEUR_DIFF: "legalReference.status.future",
};

export function legalStatusLabel(status: string, t: (key: TranslationKey) => string): string {
  const key = statusKeys[status];
  return key ? t(key) : status;
}
