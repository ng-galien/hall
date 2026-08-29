import { type FormEvent, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditIcon, PlayIcon } from "../../components/icons";
import { Modal, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge } from "../../features/status/DomainStatusBadge";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { AgendaComposer } from "./AgendaComposer";
import { MeetingDetailsCard } from "./MeetingDetailsCard";
import { MeetingStageBar } from "./MeetingStageBar";

export function MeetingPreparation({ meetingActions }: { meetingActions: ReturnType<typeof useCouncilMeeting> }) {
  const { t, formatDate, formatDateTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const detailsFieldId = useId();
  const aggregate = meetingActions.meeting!;
  const { meeting } = aggregate;
  const { members } = useCouncilMembersStore();
  const { businesses, schedulableIds } = useCouncilBusinessStore();
  const { resources, canUpload } = useResourcesStore();
  const rosterMembers = useMemo(
    () =>
      meeting.status === "draft"
        ? members.filter((member) => member.active)
        : members.filter((member) => aggregate.rosterMemberIds.includes(member.id)),
    [meeting.status, members, aggregate.rosterMemberIds],
  );
  const agendaEditable = meetingActions.can("meeting.reorder-agenda") || meetingActions.can("meeting.schedule");
  const attendanceRecorded = aggregate.attendance.length;
  const [editOpen, setEditOpen] = useState(false);
  const detailsEditable = meetingActions.can("meeting.update");
  const startsAtLocalValue = (() => {
    const date = new Date(meeting.startsAt);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  })();

  const submitDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const saved = await meetingActions.updateMeeting({
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        location: form.get("location"),
      });
      if (saved) setEditOpen(false);
      return saved;
    });
  };

  return (
    <div className="page">
      <PageHeader
        title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
        description={`${formatDateTime(meeting.startsAt)} · ${meeting.location}`}
      />
      <div className="page-content meeting-page-content">
        <RequestErrorBanner error={meetingActions.actionError} />

        <div className="meeting-console">
          <MeetingStageBar status={meeting.status} />
          <div className="meeting-prep-actionbar">
            <div className="meeting-prep-facts">
              <span>
                <strong>{formatNumber(aggregate.agendaItems.length)}</strong>{" "}
                {t(aggregate.agendaItems.length === 1 ? "meeting.agendaCount.one" : "meeting.agendaCount.other")}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong>{formatNumber(rosterMembers.length)}</strong> {t("meeting.rosterCount")}
              </span>
              {meeting.status === "scheduled" ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t("meeting.attendancePrepared")
                      .replace("{recorded}", formatNumber(attendanceRecorded))
                      .replace("{total}", formatNumber(rosterMembers.length))}
                  </span>
                </>
              ) : null}
              <MeetingStatusBadge status={meeting.status} />
              {meeting.isReconvenedMeeting ? (
                <span className="decision-meeting-chip decision-meeting-chip-none">{t("meeting.reconvenedChip")}</span>
              ) : null}
            </div>
            <div className="meeting-prep-actions">
              {detailsEditable ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <EditIcon />
                  {t("meetings.edit")}
                </Button>
              ) : null}
              {meeting.status === "draft" ? (
                <Button
                  variant="default"
                  disabled={submitting || !meetingActions.can("meeting.schedule")}
                  onClick={() => void run(() => meetingActions.changeStatus("scheduled"))}
                >
                  {t(submitting ? "common.saving" : "meeting.action.schedule")}
                </Button>
              ) : (
                <Link className="live-mode-link" to={`/meetings/${meeting.slug}/live`}>
                  <PlayIcon aria-hidden="true" />
                  {t("meeting.enterLiveMode")}
                </Link>
              )}
            </div>
          </div>
          {meeting.status === "draft" && !aggregate.agendaReady && aggregate.requiredMinutesOfMeetingId ? (
            <p className="meeting-evidence">{t("meeting.agendaNotReady")}</p>
          ) : null}
          {meeting.quorumFailure ? (
            <p className="meeting-evidence">
              {t("meeting.quorumFailureEvidence")
                .replace("{present}", formatNumber(meeting.quorumFailure.quorum.physicallyPresent))
                .replace("{required}", formatNumber(meeting.quorumFailure.quorum.required))}{" "}
              ·{" "}
              {t("meeting.quorumFailureRecordedAt").replace("{date}", formatDateTime(meeting.quorumFailure.recordedAt))}
            </p>
          ) : null}
        </div>

        <Modal open={editOpen} title={t("meetings.edit")} onClose={() => setEditOpen(false)}>
          <form className="modal-form" onSubmit={submitDetails}>
            <div className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-startsAt`}>{t("meetings.dateTime")}</Label>
                <Input
                  id={`${detailsFieldId}-startsAt`}
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={startsAtLocalValue}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-location`}>{t("meetings.location")}</Label>
                <Input id={`${detailsFieldId}-location`} name="location" defaultValue={meeting.location} required />
              </div>
            </div>
            <Button variant="default" type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
          </form>
        </Modal>

        <div className="meeting-prep-layout">
          <AgendaComposer
            agendaItems={aggregate.agendaItems}
            businesses={businesses.filter((business) => schedulableIds.includes(business.id))}
            decisions={aggregate.councilDecisions}
            editable={agendaEditable}
            onSchedule={meetingActions.scheduleCouncilBusiness}
            onQuickCreate={(input, position) => meetingActions.createAndScheduleBusiness(input, position)}
            onUpdateBusiness={meetingActions.updateCouncilBusiness}
            onAttachDecision={meetingActions.attachCouncilDecision}
            onDetachDecision={meetingActions.detachCouncilDecision}
            onSaveDecisionText={meetingActions.updateDecision}
            onRemove={meetingActions.removeAgendaItem}
            onReorder={meetingActions.reorderAgenda}
          />
          <MeetingDetailsCard
            aggregate={aggregate}
            members={rosterMembers}
            documents={resources.filter(
              (resource): resource is Extract<typeof resource, { kind: "document" }> =>
                resource.kind === "document" && resource.meetingId === meeting.id,
            )}
            officersEditable={meetingActions.can("meeting.set-officers")}
            documentsEditable={canUpload}
            onSaveOfficers={meetingActions.setOfficers}
          />
        </div>
      </div>
    </div>
  );
}
