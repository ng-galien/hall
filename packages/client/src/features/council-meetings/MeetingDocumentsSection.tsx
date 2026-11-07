// biome-ignore-all lint/correctness/useExhaustiveDependencies: Notice and minutes changes intentionally reload their state.
import { findSirenLink, type MeetingNotice, type MeetingNoticeMessagePreparation } from "@hall/api-contract";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  AttendanceSheetIcon,
  CheckCircleIcon,
  DecisionsIcon,
  DossierIcon,
  GenerateIcon,
  MailIcon,
  MinutesIcon,
  NoticeIcon,
  PrintIcon,
  ProxyIcon,
  WarningIcon,
} from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { type ApiErrorCode, apiErrorCode, SirenCapabilityUnavailable } from "../../services/apiClient";
import {
  downloadMeetingNoticeMessage,
  generateMeetingNotice,
  listMeetingNotices,
  openMeetingNotice,
  prepareMeetingNoticeMessage,
} from "../../services/meetingNoticesApi";
import { openMinutes } from "../../services/minutesApi";
import { liveBusinessTitle } from "../council-business/presentation";
import { DocumentObjectViewer } from "../documents/DocumentObjectViewer";
import { MeetingNoticeDeadline } from "./MeetingNoticeDeadline";
import { MeetingProxyFormDialog } from "./MeetingProxyFormDialog";
import { formatMeetingLabel } from "./meetingPresentation";

type DocumentTone = "done" | "todo" | "error" | "neutral";

type DocumentOpening = { onClick: () => void; disabled?: boolean } | { to: string };

function DocumentRow({
  testId,
  icon,
  name,
  opening,
  state,
  tone = "neutral",
  actions,
  children,
}: {
  testId: string;
  icon: ReactNode;
  name: string;
  opening?: DocumentOpening;
  state: ReactNode;
  tone?: DocumentTone;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const title = !opening ? (
    <strong>{name}</strong>
  ) : "to" in opening ? (
    <Link className="meeting-document-link" to={opening.to} data-testid={`${testId}-open`}>
      {name}
    </Link>
  ) : (
    <button
      type="button"
      className="meeting-document-link"
      data-testid={`${testId}-open`}
      disabled={opening.disabled}
      onClick={opening.onClick}
    >
      {name}
    </button>
  );
  const statusIcon =
    tone === "done" ? (
      <CheckCircleIcon aria-hidden="true" />
    ) : tone === "todo" || tone === "error" ? (
      <WarningIcon aria-hidden="true" />
    ) : (
      icon
    );
  return (
    <li className="meeting-document-row" data-testid={testId} data-tone={tone}>
      <span className="meeting-document-icon" data-tone={tone} aria-hidden="true">
        {statusIcon}
      </span>
      <span className="meeting-document-copy">
        {title}
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
// @implements-requirement HALL-FR-NOT-100
/**
 * Every document of a meeting on one list: name, state and the actions its Siren representation offers.
 * One notice per established revision; the notice of the established revision is the current one.
 */
export function MeetingDocumentsSection({
  meetingActions,
  aggregate,
}: {
  meetingActions: ReturnType<typeof useCouncilMeeting>;
  aggregate: LiveMeetingPresentation;
}) {
  const { t, plural, formatDate, formatDateTime, formatNumber } = useI18n();
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
  const dossierHref = `/api/council-meetings/${meeting.id}/dossier`;

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
            icon={<NoticeIcon />}
            name={t("meeting.notice.title")}
            opening={
              currentNotice
                ? { onClick: () => perform(() => showNotice(currentNotice.id)), disabled: submitting }
                : undefined
            }
            state={notice.text}
            tone={notice.tone}
            actions={
              <>
                {revisionEstablished && canGenerateNotice && !currentNotice ? (
                  <Button
                    size="sm"
                    data-testid="meeting-generate-notice"
                    disabled={submitting}
                    onClick={() =>
                      perform(async () => {
                        const generated = await generateMeetingNotice(meeting.reference);
                        await meetingActions.refresh();
                        await showNotice(generated.data.id);
                      })
                    }
                  >
                    <GenerateIcon aria-hidden="true" />
                    {t(submitting ? "common.saving" : "meeting.notice.generate")}
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
                    <MailIcon aria-hidden="true" />
                    {t("meeting.notice.exportEmail")}
                  </Button>
                ) : null}
              </>
            }
          >
            {preparing ? <MeetingNoticeDeadline deadline={meeting.noticeDeadline} /> : null}
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
                        <button
                          type="button"
                          className="meeting-document-link"
                          data-testid={`meeting-notice-preview-${version.id}`}
                          disabled={submitting}
                          onClick={() => perform(() => showNotice(version.id))}
                        >
                          {t("meeting.documents.previousNotice", {
                            number: formatNumber(version.revision),
                            date: formatDateTime(version.revisionEstablishedAt),
                          })}
                        </button>
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
            icon={<DossierIcon />}
            name={t("meeting.dossier")}
            opening={
              canDossier && revisionEstablished
                ? {
                    onClick: () => setViewer({ title: `${t("meeting.dossier")} · ${meetingLabel}`, href: dossierHref }),
                  }
                : undefined
            }
            state={revisionEstablished ? t("meeting.dossierDescription") : t("meeting.documents.dossierAfterRevision")}
          />
        ) : null}

        {attendanceSheetHref ? (
          <DocumentRow
            testId="meeting-document-attendance-sheet"
            icon={<AttendanceSheetIcon />}
            name={t("meeting.attendanceSheet")}
            opening={{
              onClick: () =>
                setViewer({ title: `${t("meeting.attendanceSheet")} · ${meetingLabel}`, href: attendanceSheetHref }),
            }}
            state={t("meeting.documents.attendanceSheetState")}
          />
        ) : null}

        {proxyFormHref ? (
          <DocumentRow
            testId="meeting-document-proxy-form"
            icon={<ProxyIcon />}
            name={t("meeting.proxyForm")}
            state={t("meeting.documents.proxyFormState")}
            actions={
              <Button
                size="sm"
                variant="outline"
                data-testid="meeting-proxy-form-open"
                onClick={() => setProxyOpen(true)}
              >
                <PrintIcon aria-hidden="true" />
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
            opening={{ to: `/minutes/${meeting.minutesId}` }}
          />
        ) : null}

        {deliberationListHref ? (
          <DocumentRow
            testId="meeting-document-deliberation-list"
            icon={<DecisionsIcon />}
            name={t("meeting.deliberationList")}
            opening={{
              onClick: () =>
                setViewer({ title: `${t("meeting.deliberationList")} · ${meetingLabel}`, href: deliberationListHref }),
            }}
            state={t("meeting.documents.deliberationListState")}
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
                    <Link
                      className="meeting-document-link"
                      to={`/council-decisions/${decision.id}`}
                      data-testid={`meeting-decision-link-${decision.id}`}
                    >
                      {decision.number === null
                        ? decision.title
                        : t("meeting.documents.decisionItem", {
                            number: formatNumber(decision.number),
                            title: decision.title,
                          })}
                    </Link>
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
    </CollapsibleSection>
  );
}
