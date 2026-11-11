import { useEffect, useState } from "react";
import type { ListRowStatus } from "../../components/ui/list-row";
import { useI18n } from "../../i18n/I18nProvider";
import { openMinutes } from "../../services/minutesApi";

/** Whether the minutes to approve have their document, written as the state of the agenda row. */
export function useMinutesReadiness(minutesId: string | null, testId: string): ListRowStatus | undefined {
  const { t } = useI18n();
  const [generated, setGenerated] = useState<boolean | null>(null);
  useEffect(() => {
    if (!minutesId) return;
    let active = true;
    void openMinutes(minutesId).then(
      (result) => {
        if (active) setGenerated(Boolean(result.data.documentId));
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [minutesId]);
  if (!minutesId || generated === null) return undefined;
  return {
    tone: generated ? "success" : "neutral",
    label: t(generated ? "minutes.generated" : "minutes.notGenerated"),
    testId,
  };
}
