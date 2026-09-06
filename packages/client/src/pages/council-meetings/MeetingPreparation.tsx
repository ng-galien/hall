import type { DocumentaryResource } from "@hall/domain";
import { type FormEvent, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditIcon, PlayIcon } from "../../components/icons";
import { Modal, PageHeader, RequestErrorBanner } from "../../components/Ui";
import {
  formatMeetingLabel,
  meetingScheduleInputValue,
  meetingScheduleInstant,
} from "../../features/council-meetings/meetingPresentation";
import { MeetingLocationSelect } from "../../features/council-meetings/MeetingLocationSelect";
import { useMeetingSettings } from "../../hooks/useMeetingSettings";
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
  const { businesses } = useCouncilBusinessStore();
  const { resources, canUpload } = useResourcesStore();
  const rosterMembers = useMemo(
    () =>
      meeting.status === "draft"
        ? members.filter((member) => member.active)
        : members.filter((member) => aggregate.rosterMemberIds.includes(member.id)),
    [meeting.status, members, aggregate.rosterMemberIds],
  );
  const agendaEditable = meetingActions.can("meeting.reorder-agenda") || meetingActions.can("agenda-item.schedule");
  const attendanceRecorded = aggregate.attendance.length;
  const [editOpen, setEditOpen] = useState(false);
  const { settings, error: settingsError } = useMeetingSettings();
  const detailsEditable = meetingActions.can("meeting.prepare");
  const startsAtLocalValue = settings ? meetingScheduleInputValue(meeting.scheduledAt, settings.timeZone) : "";

  const submitDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    const form = new FormData(event.currentTarget);
    const scheduledAt = meetingScheduleInstant(String(form.get("startsAt")), settings.timeZone);
    const dateInput = event.currentTarget.elements.namedItem("startsAt") as HTMLInputElement;
    dateInput.setCustomValidity(scheduledAt ? "" : t("meetings.invalidLocalTime"));
    if (!event.currentTarget.reportValidity() || !scheduledAt) return;
    await run(async () => {
      const saved = await meetingActions.prepare({
        scheduledAt,
        location: String(form.get("location")),
        chairMemberId: String(form.get("chairMemberId")),
        secretaryMemberId: String(form.get("secretaryMemberId")),
      });
      if (saved) setEditOpen(false);
      return saved;
    });
  };

  return (
    <div className="page">
      <PageHeader
        title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
        description={[
          meeting.scheduledAt ? formatDateTime(meeting.scheduledAt) : t("workspace.dateToSet"),
          meeting.location,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <div className="page-content meeting-page-content">
        <RequestErrorBanner error={meetingActions.actionError} />
        <RequestErrorBanner error={settingsError} />

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
                <Button
                  data-testid="meeting-edit-details"
                  disabled={submitting || !settings}
                  variant={meeting.scheduledAt ? "outline" : "default"}
                  onClick={() => setEditOpen(true)}
                >
                  <EditIcon />
                  {t("meeting.generalProperties")}
                </Button>
              ) : null}
              {meeting.status !== "draft" ? (
                <Link className="live-mode-link" to={`/meetings/${meeting.slug}/live`}>
                  <PlayIcon aria-hidden="true" />
                  {t("meeting.enterLiveMode")}
                </Link>
              ) : null}
            </div>
          </div>
          {meeting.status === "draft" && !aggregate.agendaReady && aggregate.requiredMinutesOfMeetingId ? (
            <p className="meeting-evidence">{t("meeting.agendaNotReady")}</p>
          ) : null}
          {meeting.quorumFailure ? (
            <p className="meeting-evidence">
              {t("meeting.quorumFailureEvidence")
                .replace("{present}", formatNumber(meeting.quorumFailure.quorum.physicallyPresent))
                .replace("{required}", meeting.quorumFailure.quorum.required === null ? t("meeting.quorumUnestablished") : formatNumber(meeting.quorumFailure.quorum.required))}{" "}
              ·{" "}
              {t("meeting.quorumFailureRecordedAt").replace("{date}", formatDateTime(meeting.quorumFailure.recordedAt))}
            </p>
          ) : null}
        </div>

        <Modal open={editOpen} title={t("meeting.generalProperties")} onClose={() => setEditOpen(false)}>
          <form className="modal-form" onSubmit={submitDetails}>
            <RequestErrorBanner error={meetingActions.actionError} />
            <div className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-startsAt`}>{t("meetings.dateTime")}</Label>
                <Input
                  id={`${detailsFieldId}-startsAt`}
                  name="startsAt"
                  data-testid="meeting-edit-starts-at"
                  type="datetime-local"
                  defaultValue={startsAtLocalValue}
                  onChange={(event) => event.currentTarget.setCustomValidity("")}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-location`}>{t("meetings.location")}</Label>
                <MeetingLocationSelect
                  id={`${detailsFieldId}-location`}
                  testId="meeting-edit-location"
                  locations={settings?.meetingLocations ?? []}
                  current={meeting.location}
                  placeholder={t("meetings.location")}
                />
              </div>
            </div>
            <div className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-chair`}>{t("meetings.chair")}</Label>
                <Select name="chairMemberId" defaultValue={meeting.chairMemberId ?? undefined} required>
                  <SelectTrigger id={`${detailsFieldId}-chair`} data-testid="meeting-edit-chair"><SelectValue placeholder={t("meetings.chairUndesignated")} /></SelectTrigger>
                  <SelectContent>{rosterMembers.map((member) => <SelectItem key={member.id} value={member.id}>{member.contact.firstName} {member.contact.lastName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-secretary`}>{t("meetings.secretary")}</Label>
                <Select name="secretaryMemberId" defaultValue={meeting.secretaryMemberId ?? undefined} required>
                  <SelectTrigger id={`${detailsFieldId}-secretary`} data-testid="meeting-edit-secretary"><SelectValue placeholder={t("meetings.secretaryUndesignated")} /></SelectTrigger>
                  <SelectContent>{rosterMembers.map((member) => <SelectItem key={member.id} value={member.id}>{member.contact.firstName} {member.contact.lastName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button data-testid="meeting-edit-submit" variant="default" type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
          </form>
        </Modal>

        <div className="meeting-prep-layout">
          <AgendaComposer
            agendaItems={aggregate.agendaItems}
            businesses={businesses}
            decisions={aggregate.councilDecisions}
            editable={agendaEditable}
            onUpdateBusiness={meetingActions.updateBusiness}
            onSaveDecisionText={meetingActions.saveDecisionText}
            onQuickCreate={meetingActions.createAndScheduleBusiness}
            onRemove={meetingActions.deprogramAgendaItem}
            onReorder={meetingActions.reorderAgenda}
          />
          <MeetingDetailsCard
            aggregate={aggregate}
            documents={resources.filter(
              (resource): resource is DocumentaryResource =>
                resource.kind === "document" && resource.usage === "document" && resource.meetingId === meeting.id,
            )}
            documentsEditable={canUpload}
          />
        </div>
      </div>
    </div>
  );
}
