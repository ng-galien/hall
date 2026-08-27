import { Button, Field } from "@fluentui/react-components";
import { EditRegular, PlayRegular } from "@fluentui/react-icons";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Input, MeetingStatusBadge, Modal, PageHeader, RequestErrorBanner } from "../../components/Ui";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useCaseFilesStore } from "../../stores/caseFilesStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { useDocumentsStore } from "../../stores/documentsStore";
import { AgendaComposer } from "./AgendaComposer";
import { MeetingDetailsCard } from "./MeetingDetailsCard";
import { MeetingStageBar } from "./MeetingStageBar";

export function MeetingPreparation({ meetingActions }: { meetingActions: ReturnType<typeof useCouncilMeeting> }) {
  const { t, formatDateTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const aggregate = meetingActions.meeting!;
  const { meeting } = aggregate;
  const { members } = useCouncilMembersStore();
  const { councilDecisions } = useCouncilDecisionsStore();
  const { caseFiles } = useCaseFilesStore();
  const { documents } = useDocumentsStore();
  const rosterMembers = useMemo(
    () =>
      meeting.status === "draft"
        ? members.filter((member) => member.active)
        : members.filter((member) => aggregate.rosterMemberIds.includes(member.id)),
    [meeting.status, members, aggregate.rosterMemberIds],
  );
  const agendaEditable = !meeting.isReconvenedMeeting && !meeting.quorumFailure;
  const attendanceRecorded = aggregate.attendance.length;
  const [editOpen, setEditOpen] = useState(false);
  const detailsEditable = ["draft", "scheduled"].includes(meeting.status) && !meeting.quorumFailure;
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
        title: form.get("title"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        location: form.get("location"),
      });
      if (saved) setEditOpen(false);
      return saved;
    });
  };

  return (
    <div className="page">
      <PageHeader title={meeting.title} description={`${formatDateTime(meeting.startsAt)} · ${meeting.location}`} />
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
                <Button appearance="secondary" icon={<EditRegular />} onClick={() => setEditOpen(true)}>
                  {t("meetings.edit")}
                </Button>
              ) : null}
              {meeting.status === "draft" ? (
                <Button
                  appearance="primary"
                  disabled={submitting}
                  onClick={() => void run(() => meetingActions.changeStatus("scheduled"))}
                >
                  {t(submitting ? "common.saving" : "meeting.action.schedule")}
                </Button>
              ) : (
                <Link className="live-mode-link" to={`/meetings/${meeting.id}/live`}>
                  <PlayRegular aria-hidden="true" />
                  {t("meeting.enterLiveMode")}
                </Link>
              )}
            </div>
          </div>
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
            <Field label={t("meetings.name")} required>
              <Input name="title" defaultValue={meeting.title} required />
            </Field>
            <div className="form-grid">
              <Field label={t("meetings.dateTime")} required>
                <Input name="startsAt" type="datetime-local" defaultValue={startsAtLocalValue} required />
              </Field>
              <Field label={t("meetings.location")} required>
                <Input name="location" defaultValue={meeting.location} required />
              </Field>
            </div>
            <Button appearance="primary" type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
          </form>
        </Modal>

        <div className="meeting-prep-layout">
          <AgendaComposer
            agendaItems={aggregate.agendaItems}
            councilDecisions={councilDecisions}
            caseFiles={caseFiles}
            editable={agendaEditable}
            onAdd={meetingActions.addAgendaItem}
            onUpdate={meetingActions.updateAgendaItem}
            onRemove={meetingActions.removeAgendaItem}
            onReorder={meetingActions.reorderAgenda}
          />
          <MeetingDetailsCard
            aggregate={aggregate}
            members={rosterMembers}
            documents={documents.filter((document) => document.meetingId === meeting.id)}
            onSaveOfficers={meetingActions.setOfficers}
          />
        </div>
      </div>
    </div>
  );
}
