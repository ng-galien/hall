import type { MeetingStatus } from "@mairie/domain";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

const stageKeys: TranslationKey[] = [
  "meeting.stage.prepare",
  "meeting.stage.attendance",
  "meeting.stage.conduct",
  "meeting.stage.complete",
];

const stageByStatus: Record<MeetingStatus, number> = {
  draft: 0,
  scheduled: 1,
  inProgress: 2,
  closed: 3,
  cancelled: 3,
};

export function MeetingStageBar({ status }: { status: MeetingStatus }) {
  const { t } = useI18n();
  const currentStage = stageByStatus[status];

  return (
    <ol className="meeting-stage-bar" aria-label={t("meetings.description")}>
      {stageKeys.map((key, index) => (
        <li
          className={index === currentStage ? "meeting-stage meeting-stage-current" : "meeting-stage"}
          data-complete={index < currentStage || undefined}
          aria-current={index === currentStage ? "step" : undefined}
          key={key}
        >
          <span className="meeting-stage-index" aria-hidden="true">
            {index + 1}
          </span>
          <span>{t(key)}</span>
        </li>
      ))}
    </ol>
  );
}
