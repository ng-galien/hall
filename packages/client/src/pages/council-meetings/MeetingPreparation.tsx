// biome-ignore-all lint/correctness/useExhaustiveDependencies: Agenda changes intentionally reload prepared subjects.
// TODO REMOVE_STALE: propagate incomplete session marker to canonical status badge.

import type { PreparedCouncilSubject } from "@hall/api-contract";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EntitySelect } from "../../components/search/EntitySelect";
import { PageHeader, RequestErrorBanner } from "../../components/Ui";
import { AgendaRevisionControl } from "../../features/council-meetings/AgendaRevisionControl";
import { MeetingDocumentsSection } from "../../features/council-meetings/MeetingDocumentsSection";
import { MeetingEntryBlockers } from "../../features/council-meetings/MeetingEntryBlockers";
import { MeetingLocationSelect } from "../../features/council-meetings/MeetingLocationSelect";
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
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { AgendaComposer } from "./AgendaComposer";
import { councilMemberName } from "./ballotParticipants";
import { meetingPointHref } from "./MeetingPointPage";
import { MeetingStageBar } from "./MeetingStageBar";
import { type MeetingDetailsField, meetingDetailsSubmission } from "./meetingDetailsPolicy";

// @implements-requirement HALL-FR-NOT-140
/** Date and location belong to the agenda revision: they change only while it is open. */
export function MeetingPreparation({ meetingActions }: { meetingActions: ReturnType<typeof useCouncilMeeting> }) {
  const { t, locale, formatDate, formatDateTime, formatTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const phone = usePhoneLayout();
  const aggregate = meetingActions.meeting!;
  const { meeting } = aggregate;
  const entryBlockers = meetingActions.workspace!.meeting.entryBlockers;
  const { members } = useCouncilMembersStore();
  const [preparedSubjects, setPreparedSubjects] = useState<PreparedCouncilSubject[]>([]);
  const [preparedSubjectsError, setPreparedSubjectsError] = useState<ApiErrorCode | null>(null);
  const [preparedSubjectsLoading, setPreparedSubjectsLoading] = useState(false);
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
  const detailsFormRef = useRef<HTMLFormElement>(null);
  const [generalOpen, setGeneralOpen] = useState(true);
  const [detailsErrors, setDetailsErrors] = useState<Partial<Record<MeetingDetailsField, TranslationKey>>>({});
  const { settings, error: settingsError } = useMeetingSettings();
  const scheduleLocked = !meetingActions.can("meeting.schedule");
  const detailsInline =
    meetingActions.can("meeting.set-officers") || (!scheduleLocked && meetingActions.can("meeting.prepare"));
  const detailsReady = scheduleLocked || settings !== null;
  const detailsStatus = submitting ? "common.saving" : !detailsReady && !settingsError ? "common.loading" : null;
  const agendaRevision = meetingActions.workspace!.meeting.agendaRevision;
  const revisionEstablished = Boolean(agendaRevision.establishedAt);
  const canEstablish = !revisionEstablished && meetingActions.can("meeting.establish-agenda-revision");
  const canRevise = meetingActions.can("meeting.reopen-agenda");
  const canResetRevision = meetingActions.can("meeting.reset-agenda-revision");
  const startsAtLocalValue = settings ? meetingScheduleInputValue(meeting.scheduledAt, settings.timeZone) : "";

  const submitDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detailsReady || submitting) return;
    const form = new FormData(event.currentTarget);
    const submission = meetingDetailsSubmission(
      {
        scheduledAt:
          settings && !scheduleLocked
            ? meetingScheduleInstant(String(form.get("startsAt") ?? ""), settings.timeZone)
            : null,
        location: String(form.get("location") ?? ""),
        chairMemberId: String(form.get("chairMemberId") ?? ""),
        secretaryMemberId: String(form.get("secretaryMemberId") ?? ""),
      },
      meeting,
      scheduleLocked,
    );
    if (submission.kind === "invalid") {
      setDetailsErrors(submission.errors);
      return;
    }
    setDetailsErrors({});
    if (submission.kind === "unchanged") return;
    await run(async () => {
      const saved =
        submission.kind === "prepare"
          ? await meetingActions.prepare(submission.input)
          : submission.kind === "officers"
            ? await meetingActions.setOfficers(submission.input)
            : await meetingActions.schedule(submission.input);
      return saved;
    });
  };
  const detailsFieldError = (field: MeetingDetailsField) => {
    const message = detailsErrors[field];
    return message ? t(message) : undefined;
  };
  const weekday = meeting.scheduledAt
    ? new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { weekday: "long" }).format(
        new Date(meeting.scheduledAt),
      )
    : null;

  const revisionToggle =
    meeting.status === "draft" || meeting.status === "scheduled" ? (
      <AgendaRevisionControl
        number={agendaRevision.number}
        establishedAt={agendaRevision.establishedAt}
        noticeNumber={revisionEstablished && agendaRevision.noticeId ? agendaRevision.number : null}
        busy={submitting}
        onRevise={canRevise ? () => void run(() => meetingActions.reopenAgenda()) : undefined}
        onConfirm={canEstablish ? () => void run(() => meetingActions.establishAgendaRevision()) : undefined}
        onCancel={canResetRevision ? () => void run(() => meetingActions.resetAgendaRevision()) : undefined}
      />
    ) : null;
  const phoneReader = phone && !agendaEditable && !detailsInline;
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === "#agenda") document.getElementById("meeting-agenda")?.scrollIntoView();
  }, [hash]);
  return (
    <div className="page meeting-preparation">
      <PageHeader
        title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
        above={
          phoneReader ? undefined : (
            <MeetingStageBar
              status={meeting.status}
              agendaEstablished={Boolean(meeting.agendaRevision.establishedAt)}
              liveHref={`/meetings/${meeting.slug || meeting.id}/live`}
              liveDisabled={entryBlockers.length > 0}
            />
          )
        }
        description=""
      >
        <div className="meeting-console">
          <p className="meeting-state" data-testid="meeting-facts">
            <MeetingStatusBadge status={meeting.status} stale={meeting.stale} />
            {meeting.isReconvenedMeeting ? (
              <span data-testid="meeting-reconvened-chip">{t("meeting.reconvenedChip")}</span>
            ) : null}
            {meeting.scheduledAt ? (
              <>
                <span>{weekday}</span>
                <span>{formatTime(meeting.scheduledAt)}</span>
              </>
            ) : (
              <span>{t("workspace.dateToSet")}</span>
            )}
            {meeting.location ? <span>{meeting.location}</span> : null}
          </p>
          {phoneReader ? null : revisionToggle}
          {!detailsInline ? (
            <p className="meeting-state">
              <span>
                {t("meetings.chair")} :{" "}
                {meeting.chairMemberId ? councilMemberName(members, meeting.chairMemberId) : t("common.none")}
              </span>
              <span>
                {t("meetings.secretary")} :{" "}
                {meeting.secretaryMemberId ? councilMemberName(members, meeting.secretaryMemberId) : t("common.none")}
              </span>
            </p>
          ) : null}
          <MeetingEntryBlockers blockers={entryBlockers.filter((blocker) => blocker.code !== "agendaRevisionOpen")} />
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
        {meetingActions.actionError === "agenda_revision_item_moved" && meetingActions.actionErrorDetail ? (
          <div className="error-banner" role="alert" data-testid="meeting-reset-agenda-revision-error">
            {t("meeting.revision.itemMoved", { title: meetingActions.actionErrorDetail })}
          </div>
        ) : (
          <RequestErrorBanner error={meetingActions.actionError} />
        )}
        <RequestErrorBanner error={settingsError} />

        {detailsInline ? (
          <CollapsibleSection
            title={t("meeting.generalSection")}
            open={generalOpen}
            onOpenChange={setGeneralOpen}
            testId="meeting-general"
            className="meeting-general"
          >
            {detailsStatus ? (
              <p role="status" className="meeting-evidence" data-testid="meeting-details-status">
                {t(detailsStatus)}
              </p>
            ) : null}
            {detailsReady ? (
              <form
                ref={detailsFormRef}
                className="meeting-details-inline"
                data-testid="meeting-details-inline"
                onSubmit={submitDetails}
                onChange={(event) => event.currentTarget.requestSubmit()}
              >
                <RequestErrorBanner error={meetingActions.actionError} />
                {!scheduleLocked ? (
                  <FieldRow>
                    <Field label={t("meetings.dateTime")} error={detailsFieldError("startsAt")}>
                      <Input
                        name="startsAt"
                        data-testid="meeting-edit-starts-at"
                        type="datetime-local"
                        defaultValue={startsAtLocalValue}
                        disabled={submitting}
                        required
                      />
                    </Field>
                    {settings?.meetingLocations.length || meeting.location ? (
                      <Field label={t("meetings.location")} error={detailsFieldError("location")}>
                        <MeetingLocationSelect
                          testId="meeting-edit-location"
                          locations={settings?.meetingLocations ?? []}
                          current={meeting.location}
                          disabled={submitting}
                        />
                      </Field>
                    ) : (
                      <p className="meeting-evidence" data-testid="meeting-edit-location-missing">
                        {t("meetings.locationsMissing")}{" "}
                        <Link to="/settings" data-testid="meeting-edit-location-settings">
                          {t("meetings.locationsConfigure")}
                        </Link>
                      </p>
                    )}
                  </FieldRow>
                ) : null}
                <FieldRow>
                  <Field label={t("meetings.chair")} error={detailsFieldError("chairMemberId")}>
                    <EntitySelect
                      type="member"
                      name="chairMemberId"
                      defaultValue={meeting.chairMemberId ?? ""}
                      testId="meeting-edit-chair"
                      disabled={submitting}
                      onValueChange={() => setTimeout(() => detailsFormRef.current?.requestSubmit(), 0)}
                      options={rosterMembers.map((member) => ({
                        value: member.id,
                        label: `${member.contact.firstName} ${member.contact.lastName}`,
                      }))}
                    />
                  </Field>
                  <Field label={t("meetings.secretary")} error={detailsFieldError("secretaryMemberId")}>
                    <EntitySelect
                      type="member"
                      name="secretaryMemberId"
                      defaultValue={meeting.secretaryMemberId ?? ""}
                      testId="meeting-edit-secretary"
                      disabled={submitting}
                      onValueChange={() => setTimeout(() => detailsFormRef.current?.requestSubmit(), 0)}
                      options={rosterMembers.map((member) => ({
                        value: member.id,
                        label: `${member.contact.firstName} ${member.contact.lastName}`,
                      }))}
                    />
                  </Field>
                </FieldRow>
              </form>
            ) : null}
          </CollapsibleSection>
        ) : null}
        <div className="meeting-prep-layout" id="meeting-agenda">
          <AgendaComposer
            agendaItems={aggregate.agendaItems}
            preparedSubjects={preparedSubjects}
            preparedSubjectsLoading={preparedSubjectsLoading}
            preparedSubjectsError={preparedSubjectsError}
            onSchedulePrepared={canSchedulePrepared ? meetingActions.schedulePreparedSubject : undefined}
            editable={agendaEditable}
            pointHref={phone ? (itemId) => meetingPointHref(meeting.slug || meeting.id, itemId) : undefined}
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
        <MeetingDocumentsSection meetingActions={meetingActions} aggregate={aggregate} />
      </div>
    </div>
  );
}
