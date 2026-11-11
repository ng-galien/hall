import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CopyReferenceButton, copyObjectReference } from "../../components/CopyReferenceButton";
import { ArrowDownIcon, CalendarIcon, PdfIcon, ShareIcon, VisibleIcon } from "../../components/icons";
import { ShareButton } from "../../components/ShareButton";
import { EmptyState, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { CollapsibleSection } from "../../components/ui/collapsible-section";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { DocumentViewerDialog } from "../../features/documents/DocumentViewerDialog";
import { NativeDocumentFrame } from "../../features/documents/NativeDocumentFrame";
import { useI18n } from "../../i18n/I18nProvider";
import { apiFile, downloadFile, shareOrDownload } from "../../services/fileSharing";
import { minutesContentHref } from "../../services/minutesApi";
import { ScreenTitle } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { type PhoneDocumentAction, PhoneDocumentActions, phoneActionIcons } from "../workspace/PhoneDocumentActions";
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
  const phone = usePhoneLayout();
  const navigate = useNavigate();
  const [factsOpen, setFactsOpen] = useState(false);
  const councilLabel = minutes ? t("minutes.councilNumber", { number: formatNumber(minutes.meetingNumber) }) : "";
  const dateAndPlace = minutes
    ? [minutes.scheduledAt ? formatDate(minutes.scheduledAt) : null, minutes.facts.meeting.location]
        .filter(Boolean)
        .join(" · ")
    : "";
  const reference = {
    name: [councilLabel, minutes?.scheduledAt ? formatDate(minutes.scheduledAt) : null].filter(Boolean).join(" · "),
    page: `/app/minutes/${id}`,
    href: `/api/minutes/${id}`,
  };
  const minutesFile = () => apiFile(minutesContentHref(id), "proces-verbal.pdf");
  const phoneActions: PhoneDocumentAction[] = minutes
    ? [
        ...(draft.canPreview
          ? [
              {
                id: "minutes-preview",
                label: t("minutes.preview"),
                icon: <VisibleIcon />,
                onSelect: () => void draft.preview(),
              },
            ]
          : []),
        ...(draft.canGenerate
          ? [
              {
                id: "minutes-generate",
                label: t("minutes.generate"),
                icon: <PdfIcon />,
                onSelect: () => void draft.generate(),
              },
            ]
          : []),
        ...(minutes.documentId
          ? [
              {
                id: "minutes-share",
                label: t("common.share"),
                icon: <ShareIcon />,
                onSelect: () => void minutesFile().then(shareOrDownload),
              },
              {
                id: "minutes-download",
                label: t("minutes.download"),
                icon: <ArrowDownIcon />,
                onSelect: () => void minutesFile().then(downloadFile),
              },
            ]
          : []),
        {
          id: "minutes-source-meeting",
          label: t("minutes.sourceMeeting"),
          icon: <CalendarIcon />,
          onSelect: () => navigate(`/meetings/${minutes.councilMeetingId}`),
        },
        ...(approvalMeeting
          ? [
              {
                id: "minutes-approval-meeting",
                label: `${t("minutes.approvalMeeting")} · ${t("minutes.councilNumber", { number: formatNumber(approvalMeeting.number) })}`,
                icon: <CalendarIcon />,
                onSelect: () => navigate(`/meetings/${approvalMeeting.reference}`),
              },
            ]
          : []),
        {
          id: "copy-reference",
          label: t("reference.copy"),
          icon: <phoneActionIcons.copy />,
          onSelect: () => void copyObjectReference(reference).catch(() => undefined),
        },
      ]
    : [];
  const minutesState = minutes ? (
    <p className="meeting-state minutes-header-status">
      <span
        className="list-row-status"
        data-tone={minutes.settledAt ? "success" : "neutral"}
        data-testid="minutes-settlement-status"
      >
        {t(minutes.settledAt ? "minutes.stopped" : "minutes.notStopped")}
      </span>
      <span className="list-row-status" data-tone={minutes.generatedAt ? "success" : "neutral"}>
        {t(minutes.generatedAt ? "minutes.generated" : "minutes.draft")}
      </span>
    </p>
  ) : null;
  return (
    <div className="page" data-testid="minutes-detail">
      {phone && minutes ? (
        <>
          <ScreenTitle>{councilLabel}</ScreenTitle>
          <PhoneDocumentActions actions={phoneActions} />
          <div className="phone-record-heading">
            <p>{dateAndPlace}</p>
            {minutesState}
            {minutes.documentId ? (
              <Button
                ref={documentTrigger}
                className="w-full"
                data-testid="minutes-view-document"
                onClick={draft.openDocument}
              >
                <VisibleIcon aria-hidden="true" />
                {t("minutes.viewDocument")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="minutes-detail-header" hidden={phone}>
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
          titleAction={
            minutes ? (
              <CopyReferenceButton
                reference={{
                  name: [
                    t("minutes.councilNumber", { number: formatNumber(minutes.meetingNumber) }),
                    minutes.scheduledAt ? formatDate(minutes.scheduledAt) : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  page: `/app/minutes/${id}`,
                  href: `/api/minutes/${id}`,
                }}
              />
            ) : null
          }
        >
          {minutes ? (
            <>
              {minutesState}
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
                      variant="secondary"
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
                    <>
                      <Button
                        ref={documentTrigger}
                        variant="secondary"
                        data-testid="minutes-view-document"
                        onClick={draft.openDocument}
                      >
                        <VisibleIcon aria-hidden="true" />
                        {t("minutes.viewDocument")}
                      </Button>
                      <ShareButton
                        testId="minutes-share"
                        file={() => apiFile(minutesContentHref(id), "proces-verbal.pdf")}
                      />
                      <Button asChild variant="secondary">
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
          <Button variant="secondary" data-testid="minutes-open-retry" onClick={() => void draft.load()}>
            {t("common.retry")}
          </Button>
        ) : null}
        {minutes ? (
          <div className="admin-detail-surface minutes-editorial-surface">
            {phone ? (
              <CollapsibleSection
                className="phone-document-information"
                testId="minutes-phone-facts"
                title={t("workspace.information")}
                open={factsOpen}
                onOpenChange={setFactsOpen}
              >
                {factsOpen ? <MinutesFacts facts={minutes.facts} /> : null}
              </CollapsibleSection>
            ) : (
              <MinutesFacts facts={minutes.facts} />
            )}
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
                <Button variant="secondary" data-testid="minutes-save-retry" onClick={() => void draft.flush()}>
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
