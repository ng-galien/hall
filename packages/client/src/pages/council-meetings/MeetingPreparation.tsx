// biome-ignore-all lint/correctness/useExhaustiveDependencies: Agenda changes intentionally reload prepared subjects.
// TODO REMOVE_STALE: propagate incomplete session marker to canonical status badge.

import type { PreparedCouncilSubject } from "@hall/api-contract";
import type { DocumentaryResource } from "@hall/domain";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditIcon, FileIcon, PlayIcon } from "../../components/icons";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { MeetingEntryBlockers } from "../../features/council-meetings/MeetingEntryBlockers";
import { MeetingLocationSelect } from "../../features/council-meetings/MeetingLocationSelect";
import { MeetingNoticeActions } from "../../features/council-meetings/MeetingNoticeActions";
import {
  formatMeetingLabel,
  meetingScheduleInputValue,
  meetingScheduleInstant,
} from "../../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge } from "../../features/status/DomainStatusBadge";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useMeetingSettings } from "../../hooks/useMeetingSettings";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { listPreparedCouncilSubjects } from "../../services/councilBusinessApi";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { AgendaComposer } from "./AgendaComposer";
import { MeetingDetailsCard } from "./MeetingDetailsCard";
import { MeetingStageBar } from "./MeetingStageBar";
import { type MeetingDetailsField, meetingDetailsSubmission } from "./meetingDetailsPolicy";

export function MeetingPreparation({ meetingActions }: { meetingActions: ReturnType<typeof useCouncilMeeting> }) {
  const { t, plural, formatDate, formatDateTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const detailsFieldId = useId();
  const aggregate = meetingActions.meeting!;
  const { meeting } = aggregate;
  const entryBlockers = meetingActions.workspace!.meeting.entryBlockers;
  const { members } = useCouncilMembersStore();
  const [preparedSubjects, setPreparedSubjects] = useState<PreparedCouncilSubject[]>([]);
  const [preparedSubjectsError, setPreparedSubjectsError] = useState<ApiErrorCode | null>(null);
  const [preparedSubjectsLoading, setPreparedSubjectsLoading] = useState(false);
  const { resources, canUpload } = useResourcesStore();
  const rosterMembers = useMemo(
    () =>
      meeting.status === "draft"
        ? members.filter((member) => member.active)
        : members.filter((member) => aggregate.rosterMemberIds.includes(member.id)),
    [meeting.status, members, aggregate.rosterMemberIds],
  );
  const agendaEditable = meetingActions.can("meeting.reorder-agenda") || meetingActions.can("agenda-item.schedule");
  const canSchedulePrepared = meetingActions.can("agenda-item.schedule-prepared");
  const agendaSnapshot = meetingActions.workspace?.agendaItems;
  useEffect(() => {
    let active = true;
    setPreparedSubjects([]);
    setPreparedSubjectsError(null);
    setPreparedSubjectsLoading(canSchedulePrepared);
    if (canSchedulePrepared) {
      void listPreparedCouncilSubjects(meeting.id)
        .then((result) => {
          if (active) setPreparedSubjects(result.data);
        })
        .catch((error) => {
          if (active) setPreparedSubjectsError(apiErrorCode(error));
        })
        .finally(() => {
          if (active) setPreparedSubjectsLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [meeting.id, canSchedulePrepared, agendaSnapshot]);
  const attendanceRecorded = aggregate.attendance.length;
  const [editOpen, setEditOpen] = useState(false);
  const [detailsErrors, setDetailsErrors] = useState<Partial<Record<MeetingDetailsField, TranslationKey>>>({});
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const { settings, error: settingsError } = useMeetingSettings();
  const detailsEditable = meetingActions.can("meeting.prepare");
  const startsAtLocalValue = settings ? meetingScheduleInputValue(meeting.scheduledAt, settings.timeZone) : "";

  const submitDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    const form = new FormData(event.currentTarget);
    const submission = meetingDetailsSubmission(
      {
        scheduledAt: meetingScheduleInstant(String(form.get("startsAt") ?? ""), settings.timeZone),
        location: String(form.get("location") ?? ""),
        chairMemberId: String(form.get("chairMemberId") ?? ""),
        secretaryMemberId: String(form.get("secretaryMemberId") ?? ""),
      },
      meeting,
    );
    if (submission.kind === "invalid") {
      setDetailsErrors(submission.errors);
      return;
    }
    setDetailsErrors({});
    await run(async () => {
      const saved =
        submission.kind === "prepare"
          ? await meetingActions.prepare(submission.input)
          : await meetingActions.schedule(submission.input);
      if (saved) setEditOpen(false);
      return saved;
    });
  };
  const detailsFieldError = (field: MeetingDetailsField) => {
    const message = detailsErrors[field];
    return message ? (
      <p
        className="form-error"
        role="alert"
        id={`${detailsFieldId}-${field}-error`}
        data-testid={`meeting-edit-${field}-error`}
      >
        {t(message)}
      </p>
    ) : null;
  };
  const detailsFieldInvalid = (field: MeetingDetailsField) =>
    detailsErrors[field] ? { "aria-invalid": true, "aria-describedby": `${detailsFieldId}-${field}-error` } : {};

  return (
    <div className="page meeting-preparation">
      <PageHeader
        title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
        description={[
          meeting.scheduledAt ? formatDateTime(meeting.scheduledAt) : t("workspace.dateToSet"),
          meeting.location,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <div className="meeting-console">
          <MeetingStageBar status={meeting.status} />
          <div className="meeting-prep-actionbar">
            <div className="meeting-prep-facts">
              <span>
                <strong>{formatNumber(aggregate.agendaItems.length)}</strong>{" "}
                {plural(aggregate.agendaItems.length, "meeting.agendaCount.one", "meeting.agendaCount.other")}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong>{formatNumber(rosterMembers.length)}</strong> {t("meeting.rosterCount")}
              </span>
              {meeting.status === "scheduled" ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t("meeting.attendancePrepared", {
                      recorded: formatNumber(attendanceRecorded),
                      total: formatNumber(rosterMembers.length),
                    })}
                  </span>
                </>
              ) : null}
              <MeetingStatusBadge status={meeting.status} stale={meeting.stale} />
              {meeting.isReconvenedMeeting ? (
                <span
                  className="decision-meeting-chip decision-meeting-chip-none"
                  data-testid="meeting-reconvened-chip"
                >
                  {t("meeting.reconvenedChip")}
                </span>
              ) : null}
            </div>
            <div className="meeting-prep-actions">
              <MeetingNoticeActions meetingActions={meetingActions} />
              <Button variant="outline" data-testid="meeting-open-documents" onClick={() => setDocumentsOpen(true)}>
                <FileIcon />
                {t("meeting.meetingDocuments")}
              </Button>
              {detailsEditable ? (
                <Button
                  data-testid="meeting-edit-details"
                  disabled={submitting || !settings}
                  variant={meeting.scheduledAt ? "outline" : "default"}
                  onClick={() => {
                    setDetailsErrors({});
                    setEditOpen(true);
                  }}
                >
                  <EditIcon />
                  {t("meeting.generalProperties")}
                </Button>
              ) : null}
              {entryBlockers.length ? (
                <Button data-testid="meeting-enter-live" disabled aria-describedby="meeting-live-entry-reason">
                  <PlayIcon aria-hidden="true" />
                  {t("meeting.enterLiveMode")}
                </Button>
              ) : (
                <Link
                  data-testid="meeting-enter-live"
                  className="live-mode-link"
                  to={`/meetings/${meeting.slug || meeting.id}/live`}
                >
                  <PlayIcon aria-hidden="true" />
                  {t("meeting.enterLiveMode")}
                </Link>
              )}
            </div>
          </div>
          <MeetingEntryBlockers blockers={entryBlockers} />
          {meeting.status === "draft" && !aggregate.agendaReady && aggregate.requiredMinutesOfMeetingId ? (
            <p className="meeting-evidence">{t("meeting.agendaNotReady")}</p>
          ) : null}
          {meeting.quorumFailure ? (
            <p className="meeting-evidence">
              {t("meeting.quorumFailureEvidence", {
                present: formatNumber(meeting.quorumFailure.quorum.physicallyPresent),
                required:
                  meeting.quorumFailure.quorum.required === null
                    ? t("meeting.quorumUnestablished")
                    : formatNumber(meeting.quorumFailure.quorum.required),
              })}{" "}
              · {t("meeting.quorumFailureRecordedAt", { date: formatDateTime(meeting.quorumFailure.recordedAt) })}
            </p>
          ) : null}
        </div>
      </PageHeader>
      <div className="page-content meeting-page-content">
        <RequestErrorBanner error={meetingActions.actionError} />
        <RequestErrorBanner error={settingsError} />
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
                  required
                  {...detailsFieldInvalid("startsAt")}
                />
                {detailsFieldError("startsAt")}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-location`}>{t("meetings.location")}</Label>
                {settings?.meetingLocations.length || meeting.location ? (
                  <MeetingLocationSelect
                    id={`${detailsFieldId}-location`}
                    testId="meeting-edit-location"
                    locations={settings?.meetingLocations ?? []}
                    current={meeting.location}
                    placeholder={t("meetings.location")}
                  />
                ) : (
                  <p className="text-xs text-muted" data-testid="meeting-edit-location-missing">
                    {t("meetings.locationsMissing")}{" "}
                    <Link to="/settings" data-testid="meeting-edit-location-settings">
                      {t("meetings.locationsConfigure")}
                    </Link>
                  </p>
                )}
                {detailsFieldError("location")}
              </div>
            </div>
            <div className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-chair`}>{t("meetings.chair")}</Label>
                <EntitySelect
                  type="member"
                  name="chairMemberId"
                  defaultValue={meeting.chairMemberId ?? ""}
                  testId="meeting-edit-chair"
                  placeholder={t("meetings.chairUndesignated")}
                  options={rosterMembers.map((member) => ({
                    value: member.id,
                    label: `${member.contact.firstName} ${member.contact.lastName}`,
                  }))}
                />
                {detailsFieldError("chairMemberId")}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${detailsFieldId}-secretary`}>{t("meetings.secretary")}</Label>
                <EntitySelect
                  type="member"
                  name="secretaryMemberId"
                  defaultValue={meeting.secretaryMemberId ?? ""}
                  testId="meeting-edit-secretary"
                  placeholder={t("meetings.secretaryUndesignated")}
                  options={rosterMembers.map((member) => ({
                    value: member.id,
                    label: `${member.contact.firstName} ${member.contact.lastName}`,
                  }))}
                />
                {detailsFieldError("secretaryMemberId")}
              </div>
            </div>
            <Button
              className="justify-self-end"
              data-testid="meeting-edit-submit"
              variant="default"
              type="submit"
              disabled={submitting}
            >
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
          </form>
        </Modal>

        <div className="meeting-prep-layout">
          <AgendaComposer
            agendaItems={aggregate.agendaItems}
            preparedSubjects={preparedSubjects}
            preparedSubjectsLoading={preparedSubjectsLoading}
            preparedSubjectsError={preparedSubjectsError}
            onSchedulePrepared={canSchedulePrepared ? meetingActions.schedulePreparedSubject : undefined}
            editable={agendaEditable}
            onSubjectSaved={meetingActions.refresh}
            onQuickCreate={
              meetingActions.can("meeting.create-and-schedule-business")
                ? meetingActions.createAndScheduleBusiness
                : undefined
            }
            quickCreateError={meetingActions.actionError}
            onRemove={meetingActions.deprogramAgendaItem}
            onReorder={meetingActions.reorderAgenda}
          />
        </div>
        <Modal open={documentsOpen} title={t("meeting.meetingDocuments")} onClose={() => setDocumentsOpen(false)}>
          <MeetingDetailsCard
            embedded
            aggregate={aggregate}
            documents={resources.filter(
              (resource): resource is DocumentaryResource =>
                resource.kind === "document" && resource.usage === "document" && resource.meetingId === meeting.id,
            )}
            documentsEditable={canUpload}
            dossierAvailable={meetingActions.can("meeting.generate-dossier")}
          />
        </Modal>
      </div>
    </div>
  );
}
