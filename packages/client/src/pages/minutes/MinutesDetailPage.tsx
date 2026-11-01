import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon, CalendarIcon, PdfIcon, VisibleIcon } from "../../components/icons";
import { ShareButton } from "../../components/ShareButton";
import { EmptyState, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { DocumentViewerDialog } from "../../features/documents/DocumentViewerDialog";
import { NativeDocumentFrame } from "../../features/documents/NativeDocumentFrame";
import { useI18n } from "../../i18n/I18nProvider";
import { apiFile } from "../../services/fileSharing";
import { minutesContentHref } from "../../services/minutesApi";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { MinutesFacts } from "./MinutesFacts";
import { MinutesPoint } from "./MinutesPoint";
import { MinutesSectionHint } from "./MinutesSectionHint";
import { useMinutesDraft } from "./useMinutesDraft";
import "../../features/documents/DocumentViewer.css";

// @implements-requirement HALL-FR-MIN-220
// @implements-requirement HALL-FR-MIN-230
// @implements-requirement HALL-FR-MIN-250

export function MinutesDetailPage() {
  const { minutesId = "" } = useParams();
  return <MinutesDetail key={minutesId} id={minutesId} />;
}

function MinutesDetail({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const draft = useMinutesDraft(id);
  const documentTrigger = useRef<HTMLButtonElement>(null);
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const { minutes } = draft;
  const generatedDocument = draft.documentUrl === minutesContentHref(id) && Boolean(minutes?.documentId);
  const documentTitle = t(generatedDocument ? "minutes.viewerTitle" : "minutes.previewTitle", {
    meeting: minutes
      ? formatMeetingLabel(
          { number: minutes.meetingNumber, scheduledAt: minutes.scheduledAt },
          t("meetings.occurrenceLabel"),
          formatDate,
        )
      : "",
  });
  const approvalMeeting = meetings.find((meeting) => meeting.previousCouncilMeetingId === minutes?.councilMeetingId);
  return (
    <div className="page" data-testid="minutes-detail">
      <div className="minutes-detail-header">
        <PageHeader
          title={
            minutes
              ? t("minutes.councilNumber", { number: formatNumber(minutes.meetingNumber) })
              : t("navigation.minutes")
          }
          description={
            minutes
              ? [minutes.scheduledAt ? formatDate(minutes.scheduledAt) : null, minutes.facts.meeting.location]
                  .filter(Boolean)
                  .join(" · ")
              : t("minutes.detailDescription")
          }
        >
          {minutes ? (
            <>
              <div className="minutes-header-status">
                <Badge data-testid="minutes-settlement-status" variant={minutes.settledAt ? "success" : "warning"}>
                  {t(minutes.settledAt ? "minutes.stopped" : "minutes.notStopped")}
                </Badge>
                <Badge variant={minutes.generatedAt ? "success" : "warning"}>
                  {t(minutes.generatedAt ? "minutes.generated" : "minutes.draft")}
                </Badge>
              </div>
              <div className="minutes-header-links">
                <Link
                  className="record-context-link"
                  to={`/meetings/${minutes.councilMeetingId}`}
                  data-testid="minutes-source-meeting"
                >
                  <CalendarIcon aria-hidden="true" />
                  {t("minutes.sourceMeeting")}
                </Link>
                {approvalMeeting ? (
                  <Link
                    className="record-context-link"
                    to={`/meetings/${approvalMeeting.reference}`}
                    data-testid="minutes-approval-meeting"
                  >
                    <CalendarIcon aria-hidden="true" />
                    {t("minutes.approvalMeeting")} ·{" "}
                    {t("minutes.councilNumber", { number: formatNumber(approvalMeeting.number) })}
                  </Link>
                ) : null}
              </div>
              <section className="minutes-header-document" aria-labelledby="minutes-document-title">
                <div className="minutes-section-title">
                  <strong id="minutes-document-title">{t("minutes.documentControl")}</strong>
                  <MinutesSectionHint
                    text={minutes.generatedAt ? t("minutes.frozenDocumentHint") : t("minutes.generationHint")}
                  />
                </div>
                <div className="minutes-header-document-actions">
                  {draft.canPreview ? (
                    <Button
                      variant="outline"
                      size="sm"
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
                      size="sm"
                      disabled={draft.generating || draft.previewing}
                      data-testid="minutes-generate"
                      onClick={() => void draft.generate()}
                    >
                      <PdfIcon aria-hidden="true" />
                      {t(draft.generating ? "minutes.generating" : "minutes.generate")}
                    </Button>
                  ) : null}
                  {minutes.documentId ? (
                    <>
                      <Button
                        ref={documentTrigger}
                        variant="outline"
                        size="sm"
                        data-testid="minutes-view-document"
                        onClick={draft.openDocument}
                      >
                        <VisibleIcon aria-hidden="true" />
                        {t("minutes.viewDocument")}
                      </Button>
                      <ShareButton
                        size="sm"
                        testId="minutes-share"
                        file={() => apiFile(minutesContentHref(id), "proces-verbal.pdf")}
                      />
                      <Button asChild variant="outline" size="sm">
                        <a href={minutesContentHref(id)} download data-testid="minutes-download">
                          <ArrowDownIcon aria-hidden="true" />
                          {t("minutes.download")}
                        </a>
                      </Button>
                    </>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </PageHeader>
      </div>
      <div className="page-content admin-detail-page minutes-editorial-page">
        <RequestErrorBanner error={draft.error} />
        {draft.loading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : !minutes ? (
          <Button variant="outline" data-testid="minutes-open-retry" onClick={() => void draft.load()}>
            {t("common.retry")}
          </Button>
        ) : null}
        {minutes ? (
          <div className="admin-detail-surface minutes-editorial-surface">
            <MinutesFacts facts={minutes.facts} />
            <section className="admin-record" aria-labelledby="minutes-sections-title">
              <div className="admin-section-heading">
                <div>
                  <div className="minutes-section-title">
                    <h2 id="minutes-sections-title">
                      {t(minutes.generatedAt ? "minutes.recordedSections" : "minutes.sections")}
                    </h2>
                    <MinutesSectionHint text={t(minutes.generatedAt ? "minutes.frozenHint" : "minutes.sectionsHint")} />
                  </div>
                </div>
              </div>
              {minutes.facts.agenda.map((item) => (
                <MinutesPoint
                  key={item.id}
                  item={item}
                  ballots={minutes.facts.ballots.filter((ballot) => ballot.agendaItemId === item.id)}
                  editorialText={draft.sections[item.id] ?? ""}
                  saveStatus={draft.sectionSaveStatus(item.id)}
                  canEdit={draft.canEdit}
                  generating={draft.generating}
                  onEdit={(content) => draft.edit(item.id, content)}
                  onBlur={() => void draft.flush()}
                />
              ))}
              {draft.saveStatus === "error" ? (
                <Button variant="outline" data-testid="minutes-save-retry" onClick={() => void draft.flush()}>
                  {t("common.retry")}
                </Button>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
      {draft.documentUrl ? (
        <DocumentViewerDialog
          testId="minutes-document-dialog"
          titleId="minutes-document-dialog-title"
          title={documentTitle}
          description={t(generatedDocument ? "minutes.frozenDocumentHint" : "minutes.previewHint")}
          documentKind={generatedDocument ? "generated" : "draft"}
          closeTestId="minutes-document-close"
          returnFocusRef={documentTrigger}
          onClose={draft.closeDocument}
        >
          <NativeDocumentFrame
            url={draft.documentUrl}
            mediaType="application/pdf"
            title={documentTitle}
            testId="minutes-document-frame"
            onError={draft.failDocument}
          />
        </DocumentViewerDialog>
      ) : null}
    </div>
  );
}
