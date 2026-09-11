import { findSirenLink, type MeetingNotice, type MeetingNoticeMessagePreparation } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { FileIcon, VisibleIcon, WarningIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, type ApiErrorCode, SirenCapabilityUnavailable } from "../../services/apiClient";
import { downloadMeetingNoticeMessage, generateMeetingNotice, listMeetingNotices, openMeetingNotice, prepareMeetingNoticeMessage } from "../../services/meetingNoticesApi";
import { DocumentObjectViewer } from "../documents/DocumentObjectViewer";

/** Notice commands are supplied by Siren; document generation never means that a notice was sent. */
export function MeetingNoticeActions({ meetingActions }: { meetingActions: ReturnType<typeof useCouncilMeeting> }) {
  const { t, formatDateTime } = useI18n();
  const meeting = meetingActions.workspace!.meeting;
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<MeetingNotice[]>([]);
  const [message, setMessage] = useState<MeetingNoticeMessagePreparation | null>(null);
  const [previewHref, setPreviewHref] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const { submitting, run } = useSubmitting();
  const needsAttention = meeting.entryBlockers.some(({ code }) => code === "agendaNotFrozen" || code === "currentNoticeMissing");
  const canFreeze = meetingActions.can("meeting.freeze-agenda");
  const canReopen = meetingActions.can("meeting.reopen-agenda");
  const canGenerate = meetingActions.can("meeting.generate-notice");
  const canExport = meetingActions.can("meeting.generate-notice-message");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setMessage(null);
    void Promise.all([
      listMeetingNotices(meeting.reference),
      canExport ? prepareMeetingNoticeMessage(meeting.reference) : Promise.resolve(null),
    ]).then(([documents, preparation]) => {
      if (!active) return;
      setNotices(documents);
      setMessage(preparation);
    }).catch((failure) => { if (active) setError(apiErrorCode(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, meeting.reference, meeting.currentNoticeId, meeting.agendaFrozenAt, canExport, revision]);

  const perform = (action: () => Promise<unknown>) => {
    void run(async () => {
      setError(null);
      try {
        await action();
        setRevision((value) => value + 1);
      } catch (failure) { setError(apiErrorCode(failure)); }
    });
  };
  const preview = async (id: string) => {
    const document = await openMeetingNotice(id);
    const content = document.representation && findSirenLink(document.representation, "content");
    if (!content) throw new SirenCapabilityUnavailable("content");
    setPreviewHref(content.href);
  };

  return <>
    <Button variant="outline" data-testid="meeting-open-notice" onClick={() => setOpen(true)}><span className="meeting-notice-icon"><FileIcon />{needsAttention ? <WarningIcon className="meeting-notice-attention" data-testid="meeting-notice-attention" aria-hidden="true" /> : null}</span>{t("meeting.agenda")}</Button>
    <Modal open={open} title={t("meeting.notice.title")} onClose={() => setOpen(false)}>
      <div className="meeting-notice-panel">
        <p className="text-sm text-muted">{t("meeting.notice.description")}</p>
        <RequestErrorBanner error={error} />
        <RequestErrorBanner error={meetingActions.actionError} />
        <div className="meeting-notice-commands">
          {canFreeze ? <Button data-testid="meeting-freeze-agenda" disabled={submitting} onClick={() => perform(() => meetingActions.freezeAgenda())}>{t("meeting.notice.freeze")}</Button> : null}
          {canReopen ? <Button variant="outline" data-testid="meeting-reopen-agenda" disabled={submitting} onClick={() => perform(() => meetingActions.reopenAgenda())}>{t("meeting.notice.reopen")}</Button> : null}
          {canGenerate ? <Button data-testid="meeting-generate-notice" disabled={submitting} onClick={() => perform(async () => {
            const generated = await generateMeetingNotice(meeting.reference);
            await meetingActions.refresh();
            await preview(generated.data.id);
          })}>{t(meeting.currentNoticeId ? "meeting.notice.regenerate" : "meeting.notice.generate")}</Button> : null}
        </div>
        {submitting ? <p role="status">{t("common.saving")}</p> : null}
        {loading ? <p role="status">{t("common.loading")}</p> : notices.length ? <ul className="meeting-notice-versions">
          {notices.map((notice) => <li key={notice.id}>
            <span>{formatDateTime(notice.generatedAt)} · {t(notice.isCurrent ? "meeting.notice.current" : "meeting.notice.previous")}</span>
            <Button variant="ghost" size="sm" data-testid={`meeting-notice-preview-${notice.id}`} disabled={submitting} onClick={() => perform(() => preview(notice.id))}><VisibleIcon />{t("meeting.notice.preview")}</Button>
          </li>)}
        </ul> : <p className="text-sm text-muted">{t("meeting.notice.empty")}</p>}
        {canExport && message ? <section className="meeting-notice-email">
          <h3>{t("meeting.notice.emailTitle")}</h3>
          <p className="text-sm text-muted">{t("meeting.notice.emailHint")}</p>
          <ul className="meeting-notice-recipients">{message.recipients.map((recipient) => <li key={recipient.councilMemberId}>{recipient.name} · {recipient.email ?? t("meeting.notice.emailMissing")}</li>)}</ul>
          <Button variant="outline" data-testid="meeting-export-notice-message" disabled={submitting || loading || !message.canGenerate || !message.noticeId} onClick={() => perform(() => downloadMeetingNoticeMessage(meeting.reference, message.noticeId!))}>{t("meeting.notice.exportEmail")}</Button>
        </section> : null}
      </div>
    </Modal>
    {previewHref ? <DocumentObjectViewer title={t("meeting.notice.title")} objectUrl={previewHref} mediaType="application/pdf" onClose={() => setPreviewHref(null)} /> : null}
  </>;
}
