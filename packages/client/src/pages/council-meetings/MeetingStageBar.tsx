import { defineStepper } from "@stepperize/react";
import { CheckIcon, EditIcon, GavelIcon, TextDocumentIcon, MembersIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingStatus } from "../../models/liveMeeting";

const { Stepper } = defineStepper([
  { id: "prepare", title: "meeting.stage.prepare", icon: EditIcon },
  { id: "attendance", title: "meeting.stage.attendance", icon: MembersIcon },
  { id: "conduct", title: "meeting.stage.conduct", icon: GavelIcon },
  { id: "complete", title: "meeting.stage.complete", icon: TextDocumentIcon },
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
    <Stepper.Root step={stageByStatus[status]} className="meeting-stepper" data-testid="meeting-stages">
      <Stepper.List className="meeting-stepper-list" aria-label={t("meetings.description")}>
        <Stepper.Items>
          {(step, index) => (
            <Stepper.Item step={step.id} className="meeting-stepper-item" data-testid={`meeting-stage-${index + 1}`}>
              <div className="meeting-stepper-marker">
                <Stepper.Indicator className="meeting-stepper-indicator">
                  <step.icon className="meeting-stepper-icon" aria-hidden="true" />
                  <CheckIcon className="meeting-stepper-check" aria-hidden="true" />
                </Stepper.Indicator>
                {index < 3 ? <Stepper.Separator className="meeting-stepper-separator" /> : null}
              </div>
              <Stepper.Title className="meeting-stepper-title">{t(step.title)}</Stepper.Title>
            </Stepper.Item>
          )}
        </Stepper.Items>
      </Stepper.List>
    </Stepper.Root>
  );
}
