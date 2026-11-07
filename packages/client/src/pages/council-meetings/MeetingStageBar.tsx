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

/** Read-only lifecycle presentation: the server owns the phase; attendance starts once the agenda revision is established. */
export function MeetingStageBar({
  status,
  agendaEstablished = true,
  liveHref,
  liveDisabled,
}: {
  status: LiveMeetingStatus;
  agendaEstablished?: boolean;
  /** Address of the live mode; when given, the attendance step becomes the way in. */
  liveHref?: string;
  liveDisabled?: boolean;
}) {
  const { t } = useI18n();
  const stage = stageByStatus[status];
  return (
    <MeetingProgress
      advance={
        liveHref
          ? {
              step: "attendance",
              to: liveHref,
              label: t("meeting.enterLiveMode"),
              testId: "meeting-enter-live",
              disabled: liveDisabled,
              describedBy: liveDisabled ? "meeting-live-entry-reason" : undefined,
            }
          : undefined
      }
      currentStep={stage === "attendance" && !agendaEstablished ? "prepare" : stage}
      label={t("meetings.description")}
      testId="meeting-stages"
      stepTestIdPrefix="meeting-stage"
      labels={[
        t("meeting.stage.prepare"),
        t("meeting.stage.attendance"),
        t("meeting.stage.conduct"),
        t("meeting.stage.complete"),
      ]}
      hints={[
        t("meeting.stage.prepare.hint"),
        t("meeting.stage.attendance.hint"),
        t("meeting.stage.conduct.hint"),
        t("meeting.stage.complete.hint"),
      ]}
    />
  );
}
