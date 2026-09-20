import type { TranslationKey } from "../../i18n/en";

export function ballotVerdictKey(isMinutes: boolean, approved: boolean): TranslationKey {
  if (isMinutes) return approved ? "minutes.stopped" : "minutes.notStopped";
  return approved ? "status.adopted" : "status.rejected";
}
