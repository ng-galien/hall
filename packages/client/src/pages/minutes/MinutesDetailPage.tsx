import { matchLiteral } from "@hall/domain";
import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { ArrowDownIcon, CalendarIcon, CloseIcon, PdfIcon, VisibleIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { EmptyState, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { NativeDocumentFrame } from "../../features/documents/NativeDocumentFrame";
import { useI18n } from "../../i18n/I18nProvider";
import { minutesContentHref } from "../../services/minutesApi";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { MinutesAgendaFacts, MinutesFacts } from "./MinutesFacts";
import { type MinutesSaveStatus, useMinutesDraft } from "./useMinutesDraft";
import "../../features/documents/DocumentViewer.css";

export function MinutesDetailPage() {
  const { minutesId = "" } = useParams();
  return <MinutesDetail key={minutesId} id={minutesId} />;
}

function MinutesDetail({ id }: { id: string }) {
  const { t, formatNumber, formatDateTime } = useI18n();
  const draft = useMinutesDraft(id);
  const documentTrigger = useRef<HTMLButtonElement>(null);
  const documentClose = useRef<HTMLButtonElement>(null);
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const { minutes } = draft;
  const approvalMeeting = meetings.find((meeting) => meeting.previousCouncilMeetingId === minutes?.councilMeetingId);
  const statusLabels: Record<MinutesSaveStatus, string> = {
    idle: "",
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.saveFailed"),
  };
  return (
    <div className="page" data-testid="minutes-detail">
      <PageHeader
        title={
          minutes
            ? t("minutes.meetingTitle").replace("{number}", formatNumber(minutes.meetingNumber))
            : t("navigation.minutes")
        }
        description={t(minutes?.generatedAt ? "minutes.generatedDescription" : "minutes.detailDescription")}
      />
      <div className="page-content admin-detail-page">
        <RequestErrorBanner error={draft.error} />
        {draft.loading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : !minutes ? (
          <Button variant="outline" data-testid="minutes-open-retry" onClick={() => void draft.load()}>
            {t("common.retry")}
          </Button>
        ) : null}
        {minutes ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild variant="outline" size="sm">
                <Link to={`/meetings/${minutes.councilMeetingId}`} data-testid="minutes-source-meeting">
                  <CalendarIcon aria-hidden="true" />
                  {t("minutes.sourceMeeting")}
                </Link>
              </Button>
              {approvalMeeting ? (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/meetings/${approvalMeeting.reference}`} data-testid="minutes-approval-meeting">
                    <CalendarIcon aria-hidden="true" />
                    {t("minutes.approvalMeeting")} ·{" "}
                    {t("minutes.councilNumber").replace("{number}", formatNumber(approvalMeeting.number))}
                  </Link>
                </Button>
              ) : null}
              <span>{t(minutes.generatedAt ? "minutes.generated" : "minutes.draft")}</span>
            </div>
            <div className="admin-detail-surface">
              <MinutesFacts facts={minutes.facts} />
              <section className="admin-record" aria-labelledby="minutes-sections-title">
                <div className="admin-section-heading">
                  <div>
                    <h2 id="minutes-sections-title">
                      {t(minutes.generatedAt ? "minutes.recordedSections" : "minutes.sections")}
                    </h2>
                    <p>{t(minutes.generatedAt ? "minutes.frozenHint" : "minutes.sectionsHint")}</p>
                  </div>
                  <span
                    role="status"
                    data-testid="minutes-save-status"
                    className={`admin-save-state admin-save-${draft.saveStatus}`}
                  >
                    {statusLabels[draft.saveStatus]}
                  </span>
                </div>
                {minutes.facts.agenda.map((item) => (
                  <section className="admin-record" key={item.id} aria-labelledby={`minutes-section-title-${item.id}`}>
                    <div className="admin-section-heading">
                      <h3 id={`minutes-section-title-${item.id}`}>
                        {formatNumber(Math.abs(item.position))} ·{" "}
                        {matchLiteral(item.kind, {
                          minutesApproval: () => t("agendaSubject.minutesApproval"),
                          councilDecisionProposal: () => item.title,
                          openQuestion: () => item.title,
                        })}
                      </h3>
                    </div>
                    <MinutesAgendaFacts
                      item={item}
                      ballots={minutes.facts.ballots.filter((ballot) => ballot.agendaItemId === item.id)}
                    />
                    {draft.canEdit ? (
                      <MarkdownEditor
                        testId={`minutes-section-${item.id}`}
                        markdown={draft.sections[item.id]}
                        onChange={(content) => draft.edit(item.id, content)}
                        onBlur={() => void draft.flush()}
                        readOnly={draft.generating}
                      />
                    ) : (
                      <MarkdownView markdown={draft.sections[item.id]} />
                    )}
                  </section>
                ))}
                {draft.saveStatus === "error" ? (
                  <Button variant="outline" data-testid="minutes-save-retry" onClick={() => void draft.flush()}>
                    {t("common.retry")}
                  </Button>
                ) : null}
              </section>
              <section className="admin-record" aria-labelledby="minutes-document-title">
                <div className="admin-section-heading">
                  <div>
                    <h2 id="minutes-document-title">{t("minutes.document")}</h2>
                    <p>{minutes.generatedAt ? formatDateTime(minutes.generatedAt) : t("minutes.generationHint")}</p>
                  </div>
                  {draft.canPreview ? (
                    <Button
                      variant="outline"
                      disabled={draft.previewing || draft.generating}
                      data-testid="minutes-preview"
                      ref={documentTrigger}
                      onClick={() => void draft.preview()}
                    >
                      <VisibleIcon aria-hidden="true" />
                      {t(draft.previewing ? "minutes.previewing" : "minutes.preview")}
                    </Button>
                  ) : null}
                  {draft.canGenerate ? (
                    <Button
                      disabled={draft.generating || draft.previewing}
                      data-testid="minutes-generate"
                      onClick={() => void draft.generate()}
                    >
                      <PdfIcon aria-hidden="true" />
                      {t(draft.generating ? "minutes.generating" : "minutes.generate")}
                    </Button>
                  ) : null}
                  {minutes.documentId ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        ref={documentTrigger}
                        variant="outline"
                        data-testid="minutes-view-document"
                        onClick={draft.openDocument}
                      >
                        <VisibleIcon aria-hidden="true" />
                        {t("minutes.viewDocument")}
                      </Button>
                      <Button asChild variant="outline">
                        <a href={minutesContentHref(id)} download data-testid="minutes-download">
                          <ArrowDownIcon aria-hidden="true" />
                          {t("minutes.download")}
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
      {draft.documentUrl ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) draft.closeDocument();
          }}
        >
          <DialogContent
            className="document-viewer gap-0 p-0 sm:max-w-[var(--hall-size-viewer-width)]"
            data-testid="minutes-document-dialog"
            data-document-kind={minutes?.documentId ? "generated" : "draft"}
            showCloseButton={false}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              documentClose.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              documentTrigger.current?.focus();
            }}
          >
            <header>
              <div>
                <DialogTitle>{t(minutes?.documentId ? "minutes.document" : "minutes.preview")}</DialogTitle>
                <DialogDescription>
                  {t(minutes?.documentId ? "minutes.frozenDocumentHint" : "minutes.previewHint")}
                </DialogDescription>
              </div>
              <Button
                ref={documentClose}
                variant="ghost"
                size="icon"
                aria-label={t("common.close")}
                data-testid="minutes-document-close"
                onClick={draft.closeDocument}
              >
                <CloseIcon />
              </Button>
            </header>
            <div className="document-viewer-content">
              <NativeDocumentFrame
                url={draft.documentUrl}
                mediaType="application/pdf"
                title={t(minutes?.documentId ? "minutes.document" : "minutes.preview")}
                testId="minutes-document-frame"
                onError={draft.failDocument}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
