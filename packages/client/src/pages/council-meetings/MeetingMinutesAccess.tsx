import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MinutesIcon } from "../../components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";
import { openMinutes } from "../../services/minutesApi";

/** Link from the closed meeting to its minutes and their current document state. */
export function MeetingMinutesAccess({ id }: { id: string }) {
  const { t } = useI18n();
  const [record, setRecord] = useState<Awaited<ReturnType<typeof openMinutes>> | null>(null);

  useEffect(() => {
    let active = true;
    void openMinutes(id).then(
      (result) => {
        if (active) setRecord(result);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [id]);

  const generated = Boolean(record?.data.documentId);
  const status = record ? t(generated ? "minutes.generated" : "minutes.draft") : t("common.loading");

  return (
    <div className="meeting-minutes-access">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={`/minutes/${id}`}
            data-testid="meeting-minutes-link"
            aria-label={`${t("meeting.minutes")} · ${status}`}
            className={`record-context-link ${
              record ? (generated ? "record-context-link-generated" : "record-context-link-draft") : ""
            }`}
          >
            <MinutesIcon aria-hidden="true" />
            {t("meeting.minutes")}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{status}</TooltipContent>
      </Tooltip>
    </div>
  );
}
