import { EditIcon, GavelIcon, MembersIcon, TextDocumentIcon } from "../../components/icons";
import { createStageProgress } from "../../components/ui/stage-progress";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingStatus } from "../../models/liveMeeting";

const MeetingProgress = createStageProgress([
  { id: "prepare", icon: <EditIcon /> },
  { id: "attendance", icon: <MembersIcon /> },
  { id: "conduct", icon: <GavelIcon /> },
  { id: "complete", icon: <TextDocumentIcon /> },
] as const);

const stageByStatus = {
  draft: "prepare",
  scheduled: "attendance",
  inProgress: "conduct",
  closed: "complete",
  cancelled: "complete",
} satisfies Record<LiveMeetingStatus, "prepare" | "attendance" | "conduct" | "complete">;

/** Read-only lifecycle presentation: Stepperize owns step semantics, the server owns the current phase. */
export function MeetingStageBar({ status }: { status: LiveMeetingStatus }) {
  const { t } = useI18n();
  return (
    <MeetingProgress
      currentStep={stageByStatus[status]}
      label={t("meetings.description")}
      testId="meeting-stages"
      stepTestIdPrefix="meeting-stage"
      labels={[
        t("meeting.stage.prepare"),
        t("meeting.stage.attendance"),
        t("meeting.stage.conduct"),
        t("meeting.stage.complete"),
      ]}
    />
  );
}
