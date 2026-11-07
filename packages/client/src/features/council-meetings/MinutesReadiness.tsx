import type { MinutesDetail } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircleIcon, WarningIcon } from "../../components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";
import { openMinutes } from "../../services/minutesApi";
import { formatMeetingLabel } from "./meetingPresentation";

/** Whether the minutes to approve have their document: a green mark, or a warning that says what to do. */
export function MinutesReadiness({ minutesId, testId }: { minutesId: string; testId: string }) {
  const { t, formatDate } = useI18n();
  const [minutes, setMinutes] = useState<MinutesDetail | null>(null);
  useEffect(() => {
    let active = true;
    void openMinutes(minutesId).then(
      (result) => {
        if (active) setMinutes(result.data);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [minutesId]);
  if (!minutes) return null;
  const generated = Boolean(minutes.documentId);
  const meeting = formatMeetingLabel(
    { number: minutes.meetingNumber, scheduledAt: minutes.scheduledAt },
    t("meetings.occurrenceLabel"),
    formatDate,
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={`/minutes/${minutesId}`}
          className="minutes-readiness"
          data-generated={generated}
          data-testid={testId}
          aria-label={generated ? t("minutes.readiness.ready", { meeting }) : t("minutes.readiness.todo", { meeting })}
          onClick={(event) => event.stopPropagation()}
        >
          {generated ? <CheckCircleIcon aria-hidden="true" /> : <WarningIcon aria-hidden="true" />}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {generated ? t("minutes.readiness.ready", { meeting }) : t("minutes.readiness.todo", { meeting })}
      </TooltipContent>
    </Tooltip>
  );
}
