// biome-ignore-all lint/correctness/useExhaustiveDependencies: Notice and minutes changes intentionally reload their state.
import { findSirenLink, type MeetingNotice, type MeetingNoticeMessagePreparation } from "@hall/api-contract";
import type { DocumentaryResource, DocumentCategory } from "@hall/domain";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { DecisionsIcon, FileIcon, MinutesIcon, OpenIcon, PdfIcon, SignIcon } from "../../components/icons";
import { ShareButton } from "../../components/ShareButton";
import { RequestErrorBanner } from "../../components/Ui";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { type ApiErrorCode, apiErrorCode, SirenCapabilityUnavailable } from "../../services/apiClient";
import { apiFile, downloadFile } from "../../services/fileSharing";
import {
  downloadMeetingNoticeMessage,
  generateMeetingNotice,
  listMeetingNotices,
  openMeetingNotice,
  prepareMeetingNoticeMessage,
} from "../../services/meetingNoticesApi";
import { openMinutes } from "../../services/minutesApi";
import { listResources } from "../../services/resourcesApi";
import { liveBusinessTitle } from "../council-business/presentation";
import { DocumentObjectViewer } from "../documents/DocumentObjectViewer";
import { ResourcePreview } from "../documents/ResourcePreview";
import { MeetingProxyFormDialog } from "./MeetingProxyFormDialog";
import { formatMeetingLabel } from "./meetingPresentation";

export const documentCategoryKeys: Record<DocumentCategory, TranslationKey> = {
  supporting: "documentCategory.supporting",
  report: "documentCategory.report",
  draftCouncilDecision: "documentCategory.draftCouncilDecision",
  meetingNotice: "documentCategory.meetingNotice",
  minutes: "documentCategory.minutes",
  proxy: "documentCategory.proxy",
};

type DocumentTone = "done" | "todo" | "error" | "neutral";

function DocumentRow({
  testId,
  icon,
  name,
  state,
  tone = "neutral",
  actions,
  children,
}: {
  testId: string;
  icon: ReactNode;
  name: string;
  state: ReactNode;
  tone?: DocumentTone;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="meeting-document-row" data-testid={testId}>
      <span className="meeting-document-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="meeting-document-copy">
        <strong>{name}</strong>
        <span className="meeting-document-state" data-tone={tone} data-testid={`${testId}-state`}>
          {state}
        </span>
      </span>
      {actions ? <span className="meeting-document-actions">{actions}</span> : null}
      {children ? <div className="meeting-document-detail">{children}</div> : null}
    </li>
  );
}

// @implements-requirement HALL-FR-NOT-120 (the meeting dossier is offered with the meeting documents)
// @implements-requirement HALL-FR-ATT-170
// @implements-requirement HALL-FR-ATT-180
// @implements-requirement HALL-FR-MTG-390
/** Every document of a meeting on one list: name, state and the actions its Siren representation offers. */
export function MeetingDocumentsSection({
  meetingActions,
  aggregate,
}: {
  meetingActions: ReturnType<typeof useCouncilMeeting>;
  aggregate: LiveMeetingPresentation;
}) {
  const { t, plural, formatDate, formatDateTime, formatFileSize, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const meeting = meetingActions.workspace!.meeting;
  const status = aggregate.meeting.status;
  const preparing = status === "draft" || status === "scheduled";
  const closed = status === "closed";
  const meetingLabel = formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [viewer, setViewer] = useState<{ title: string; href: string } | null>(null);
  const [proxyOpen, setProxyOpen] = useState(false);

  const noticesHref = meetingActions.link("notices");
  const agendaRevision = meeting.agendaRevision;
  const revisionEstablished = Boolean(agendaRevision.establishedAt);
  const canGenerateNotice = meetingActions.can("meeting.generate-notice");
  const canExportNotice = meetingActions.can("meeting.generate-notice-message");
  const [notices, setNotices] = useState<MeetingNotice[]>([]);
  const [message, setMessage] = useState<MeetingNoticeMessagePreparation | null>(null);
  const [previousOpen, setPreviousOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!noticesHref) return;
    let active = true;
    void Promise.all([
      listMeetingNotices(meeting.reference),
      canExportNotice ? prepareMeetingNoticeMessage(meeting.reference) : Promise.resolve(null),
    ]).then(
      ([documents, preparation]) => {
        if (!active) return;
        setNotices(documents);
        setMessage(preparation);
      },
      (failure) => {
        if (active) setError(apiErrorCode(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [
    noticesHref,
    meeting.reference,
    agendaRevision.number,
    agendaRevision.establishedAt,
    agendaRevision.noticeId,
    canExportNotice,
    revision,
  ]);
  // @implements-requirement HALL-FR-NOT-100
  // One notice per established revision; the notice of the established revision is the current one.
  const currentNotice = revisionEstablished
    ? (notices.find((notice) => notice.revision === agendaRevision.number) ?? null)
    : null;
  const previousNotices = notices.filter((notice) => notice !== currentNotice);

  const perform = (action: () => Promise<unknown>) => {
    void run(async () => {
      setError(null);
      try {
        await action();
        setRevision((value) => value + 1);
      } catch (failure) {
        setError(apiErrorCode(failure));
      }
    });
  };
  const showNotice = async (id: string) => {
    const document = await openMeetingNotice(id);
    const content = document.representation && findSirenLink(document.representation, "content");
    if (!content) throw new SirenCapabilityUnavailable("content");
    setViewer({ title: `${t("meeting.notice.title")} · ${meetingLabel}`, href: content.href });
  };
  const noticeState = (): { text: string; tone: DocumentTone } => {
    if (currentNotice)
      return {
        text: t("meeting.documents.noticeEstablished", {
          number: formatNumber(currentNotice.revision),
          date: formatDateTime(currentNotice.generatedAt),
        }),
        tone: "done",
      };
    if (revisionEstablished && agendaRevision.noticeId) return { text: t("common.loading"), tone: "neutral" };
    if (revisionEstablished)
      return {
        text: t("meeting.documents.noticeMissing", { number: formatNumber(agendaRevision.number) }),
        tone: "todo",
      };
    if (preparing)
      return {
        text: t("meeting.documents.noticeOpenRevision", { number: formatNumber(agendaRevision.number) }),
        tone: "todo",
      };
    return { text: t("meeting.notice.empty"), tone: "neutral" };
  };

  const canDossier = meetingActions.can("meeting.generate-dossier");
  const [dossierState, setDossierState] = useState<"idle" | "pending" | "failed">("idle");
  const dossierFile = () => apiFile(`/council-meetings/${meeting.id}/dossier`, "dossier-seance.pdf", "application/pdf");
  const downloadDossier = async () => {
    setDossierState("pending");
    try {
      downloadFile(await dossierFile());
      setDossierState("idle");
    } catch {
      setDossierState("failed");
    }
  };

  // Pieces already filed on the meeting stay listed; filing new ones is not offered here.
  const [attachments, setAttachments] = useState<DocumentaryResource[]>([]);
  useEffect(() => {
    let active = true;
    void listResources({ meetingId: meeting.id, kind: "document", usage: "document" }).then(
      (resources) => {
        if (!active) return;
        setAttachments(
          resources.filter(
            (resource): resource is DocumentaryResource =>
              resource.kind === "document" && resource.usage === "document" && resource.meetingId === meeting.id,
          ),
        );
      },
      (failure) => {
        if (active) setError(apiErrorCode(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [meeting.id]);
  const [viewedAttachment, setViewedAttachment] = useState<DocumentaryResource | null>(null);

  const attendanceSheetHref = meetingActions.link("attendance-sheet");
  const proxyFormHref = meetingActions.link("proxy-form");
  const deliberationListHref = meetingActions.link("deliberation-list");

  const [minutesGenerated, setMinutesGenerated] = useState<boolean | null>(null);
  useEffect(() => {
    if (!closed || !meeting.minutesId) return;
    let active = true;
    void openMinutes(meeting.minutesId).then(
      (result) => {
        if (active) setMinutesGenerated(Boolean(result.data.documentId));
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [closed, meeting.minutesId]);

  const decisions = closed
    ? [...aggregate.agendaItems]
        .sort((left, right) => left.position - right.position)
        .flatMap((item) =>
          item.business.councilDecisionId
            ? [
                {
                  id: item.business.councilDecisionId,
                  number: item.agendaNumber,
                  title: liveBusinessTitle(item.business, t("agendaSubject.minutesApproval")),
                },
              ]
            : [],
        )
    : [];

  const notice = noticeState();
  const showNoticeRow = Boolean(noticesHref) || canGenerateNotice;

  return (
    <CollapsibleSection
      title={t("meeting.documents.title")}
      icon={<FileIcon />}
      open={open}
      onOpenChange={setOpen}
      testId="meeting-documents"
      className="meeting-documents"
    >
      <RequestErrorBanner error={error} />
      <RequestErrorBanner error={meetingActions.actionError} />
      <ul className="meeting-document-list">
        {showNoticeRow ? (
          <DocumentRow
            testId="meeting-document-notice"
            icon={<PdfIcon />}
            name={t("meeting.notice.title")}
            state={notice.text}
            tone={notice.tone}
            actions={
              <>
                {currentNotice ? (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="meeting-notice-open"
                    disabled={submitting}
                    onClick={() => perform(() => showNotice(currentNotice.id))}
                  >
                    <OpenIcon />
                    {t("meeting.documents.open")}
                  </Button>
                ) : null}
                {revisionEstablished && canGenerateNotice ? (
                  <Button
                    size="sm"
                    variant={currentNotice ? "outline" : "default"}
                    data-testid="meeting-notice-regenerate"
                    disabled={submitting}
                    onClick={() =>
                      perform(async () => {
                        const generated = await generateMeetingNotice(meeting.reference);
                        await meetingActions.refresh();
                        await showNotice(generated.data.id);
                      })
                    }
                  >
                    {t("meeting.notice.regenerate")}
                  </Button>
                ) : null}
                {canExportNotice && message && preparing && currentNotice ? (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="meeting-export-notice-message"
                    disabled={submitting || !message.canGenerate}
                    onClick={() => perform(() => downloadMeetingNoticeMessage(meeting.reference, currentNotice.id))}
                  >
                    {t("meeting.notice.exportEmail")}
                  </Button>
                ) : null}
              </>
            }
          >
            {canExportNotice && message && preparing && message.missingEmailMemberIds.length ? (
              <p className="meeting-document-note" data-testid="meeting-notice-missing-emails">
                {plural(
                  message.missingEmailMemberIds.length,
                  "meeting.documents.noticeMissingEmails.one",
                  "meeting.documents.noticeMissingEmails.other",
                )}
              </p>
            ) : null}
            {previousNotices.length ? (
              <>
                <Button
                  variant="link"
                  size="xs"
                  className="meeting-document-toggle"
                  aria-expanded={previousOpen}
                  data-testid="meeting-notice-previous-toggle"
                  onClick={() => setPreviousOpen((value) => !value)}
                >
                  {plural(
                    previousNotices.length,
                    "meeting.documents.previousNotices.one",
                    "meeting.documents.previousNotices.other",
                  )}
                </Button>
                {previousOpen ? (
                  <ul className="meeting-document-sublist" data-testid="meeting-notice-previous-list">
                    {previousNotices.map((version) => (
                      <li key={version.id}>
                        <span>
                          {t("meeting.documents.previousNotice", {
                            number: formatNumber(version.revision),
                            date: formatDateTime(version.revisionEstablishedAt),
                          })}
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          data-testid={`meeting-notice-preview-${version.id}`}
                          disabled={submitting}
                          onClick={() => perform(() => showNotice(version.id))}
                        >
                          <OpenIcon />
                          {t("meeting.documents.open")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </DocumentRow>
        ) : null}

        {preparing || canDossier ? (
          <DocumentRow
            testId="meeting-dossier"
            icon={<PdfIcon />}
            name={t("meeting.dossier")}
            state={
              dossierState === "failed"
                ? t("meeting.dossierFailed")
                : revisionEstablished
                  ? t("meeting.dossierDescription")
                  : t("meeting.documents.dossierAfterRevision")
            }
            tone={dossierState === "failed" ? "error" : "neutral"}
            actions={
              canDossier ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="meeting-dossier-download"
                    disabled={dossierState === "pending"}
                    onClick={() => void downloadDossier()}
                  >
                    {t(dossierState === "pending" ? "meeting.dossierPending" : "meeting.dossierDownload")}
                  </Button>
                  <ShareButton
                    size="sm"
                    testId="meeting-dossier-share"
                    file={dossierFile}
                    onError={() => setDossierState("failed")}
                  />
                </>
              ) : undefined
            }
          />
        ) : null}

        {attachments.length ? (
          <DocumentRow
            testId="meeting-document-attachments"
            icon={<FileIcon />}
            name={t("meeting.documents.attachments")}
            state={`${formatNumber(attachments.length)} ${plural(attachments.length, "meeting.documents.attachmentCount.one", "meeting.documents.attachmentCount.other")}`}
          >
            {attachments.length ? (
              <ul className="meeting-document-sublist">
                {attachments.map((document) => (
                  <li key={document.id}>
                    <span className="meeting-document-sublist-copy">
                      <span>{document.fileName}</span>
                      <span className="meeting-document-note">
                        {t(documentCategoryKeys[document.category])} · {formatFileSize(document.byteSize)}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={t("meeting.viewDocument", { name: document.fileName })}
                      onClick={() => setViewedAttachment(document)}
                    >
                      <OpenIcon />
                      {t("meeting.documents.open")}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </DocumentRow>
        ) : null}

        {attendanceSheetHref ? (
          <DocumentRow
            testId="meeting-document-attendance-sheet"
            icon={<SignIcon />}
            name={t("meeting.attendanceSheet")}
            state={t("meeting.documents.attendanceSheetState")}
            actions={
              <Button
                size="sm"
                variant="outline"
                data-testid="meeting-attendance-sheet-open"
                onClick={() =>
                  setViewer({ title: `${t("meeting.attendanceSheet")} · ${meetingLabel}`, href: attendanceSheetHref })
                }
              >
                <OpenIcon />
                {t("meeting.documents.open")}
              </Button>
            }
          />
        ) : null}

        {proxyFormHref ? (
          <DocumentRow
            testId="meeting-document-proxy-form"
            icon={<SignIcon />}
            name={t("meeting.proxyForm")}
            state={t("meeting.documents.proxyFormState")}
            actions={
              <Button
                size="sm"
                variant="outline"
                data-testid="meeting-proxy-form-open"
                onClick={() => setProxyOpen(true)}
              >
                {t("meeting.proxyFormOpen")}
              </Button>
            }
          />
        ) : null}

        {closed && meeting.minutesId ? (
          <DocumentRow
            testId="meeting-document-minutes"
            icon={<MinutesIcon />}
            name={t("meeting.minutes")}
            state={
              minutesGenerated === null
                ? t("common.loading")
                : t(minutesGenerated ? "minutes.generated" : "minutes.draft")
            }
            tone={minutesGenerated ? "done" : minutesGenerated === false ? "todo" : "neutral"}
            actions={
              <Button size="sm" variant="outline" asChild>
                <Link to={`/minutes/${meeting.minutesId}`} data-testid="meeting-minutes-link">
                  <OpenIcon />
                  {t("meeting.documents.open")}
                </Link>
              </Button>
            }
          />
        ) : null}

        {deliberationListHref ? (
          <DocumentRow
            testId="meeting-document-deliberation-list"
            icon={<PdfIcon />}
            name={t("meeting.deliberationList")}
            state={t("meeting.documents.deliberationListState")}
            actions={
              <Button
                size="sm"
                variant="outline"
                data-testid="meeting-deliberation-list-open"
                onClick={() =>
                  setViewer({ title: `${t("meeting.deliberationList")} · ${meetingLabel}`, href: deliberationListHref })
                }
              >
                <OpenIcon />
                {t("meeting.documents.open")}
              </Button>
            }
          />
        ) : null}

        {closed ? (
          <DocumentRow
            testId="meeting-document-decisions"
            icon={<DecisionsIcon />}
            name={t("meeting.documents.decisions")}
            state={
              decisions.length
                ? `${formatNumber(decisions.length)} ${plural(decisions.length, "meeting.documents.decisionCount.one", "meeting.documents.decisionCount.other")}`
                : t("meeting.documents.decisionsEmpty")
            }
          >
            {decisions.length ? (
              <ul className="meeting-document-sublist">
                {decisions.map((decision) => (
                  <li key={decision.id}>
                    <span className="meeting-document-sublist-copy">
                      <span>
                        {decision.number === null
                          ? decision.title
                          : t("meeting.documents.decisionItem", {
                              number: formatNumber(decision.number),
                              title: decision.title,
                            })}
                      </span>
                    </span>
                    <Button variant="ghost" size="xs" asChild>
                      <Link
                        to={`/council-decisions/${decision.id}`}
                        data-testid={`meeting-decision-link-${decision.id}`}
                      >
                        <OpenIcon />
                        {t("meeting.documents.open")}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </DocumentRow>
        ) : null}
      </ul>
      {proxyFormHref ? (
        <MeetingProxyFormDialog
          open={proxyOpen}
          proxyFormHref={proxyFormHref}
          onClose={() => setProxyOpen(false)}
          onGenerate={(href) => {
            setProxyOpen(false);
            setViewer({ title: `${t("meeting.proxyForm")} · ${meetingLabel}`, href });
          }}
        />
      ) : null}
      {viewer ? (
        <DocumentObjectViewer
          title={viewer.title}
          objectUrl={viewer.href}
          mediaType="application/pdf"
          onClose={() => setViewer(null)}
        />
      ) : null}
      {viewedAttachment ? (
        <ResourcePreview resourceId={viewedAttachment.id} onClose={() => setViewedAttachment(null)} />
      ) : null}
    </CollapsibleSection>
  );
}
