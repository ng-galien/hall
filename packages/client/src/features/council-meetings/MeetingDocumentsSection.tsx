// biome-ignore-all lint/correctness/useExhaustiveDependencies: Notice and minutes changes intentionally reload their state.
import { findSirenLink, type MeetingNotice, type MeetingNoticeMessagePreparation } from "@hall/api-contract";
import { Children, type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SectionHeader } from "@/components/ui/section-header";
import { HelpHint } from "../../components/HelpHint";
import {
  AttendanceSheetIcon,
  DecisionsIcon,
  DossierIcon,
  GenerateIcon,
  MailIcon,
  MinutesIcon,
  NoticeIcon,
  PrintIcon,
  ProxyIcon,
} from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { DisclosureBadge } from "../../components/ui/disclosure-badge";
import {
  ListRow,
  ListRowIcon,
  type ListRowStatus,
  type ListRowStatusTone,
  ListRows,
} from "../../components/ui/list-row";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { openCouncilDecisionDocument } from "../../services/councilDecisionsApi";
import {
  generateMeetingNotice,
  listMeetingNotices,
  meetingNoticeContentHref,
  prepareMeetingNoticeMail,
  prepareMeetingNoticeMessage,
} from "../../services/meetingNoticesApi";
import { minutesContentHref, openMinutes } from "../../services/minutesApi";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { liveBusinessTitle } from "../council-business/presentation";
import { DocumentObjectViewer } from "../documents/DocumentObjectViewer";
import { MeetingNoticeDeadline } from "./MeetingNoticeDeadline";
import { MeetingProxyFormDialog } from "./MeetingProxyFormDialog";
import { formatMeetingLabel } from "./meetingPresentation";

/** A document is available, not yet established (a fact, never a request), or in default. */
type DocumentTone = "done" | "pending" | "error" | "neutral";

type DocumentOpening = { onClick: () => void; disabled?: boolean } | { to: string };

/** A document that waits for an action or fails carries its state in a tag; an available document says it in text. */
const documentToneStatus: Partial<Record<DocumentTone, ListRowStatusTone>> = {
  pending: "action",
  error: "danger",
};

/** The written command that opens the PDF of a document in the document viewer. */
function OpenPdfCommand({ testId, onClick, disabled }: { testId: string; onClick(): void; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <Button variant="plain" className="hall-link" data-testid={testId} disabled={disabled} onClick={onClick}>
      {t("meeting.documents.openPdf")}
    </Button>
  );
}

function DocumentRow({
  testId,
  icon,
  name,
  opening,
  pdf = false,
  state,
  tone = "neutral",
  status,
  actions,
  children,
}: {
  testId: string;
  icon: ReactNode;
  name: string;
  /** What a click on the name opens. */
  opening?: DocumentOpening;
  /** The opening shows the PDF of the document: the row also offers « Ouvrir le PDF ». */
  pdf?: boolean;
  state: ReactNode;
  tone?: DocumentTone;
  /** A state of the document itself, in a tag beside its facts. */
  status?: ListRowStatus;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const stateTestId = `${testId}-state`;
  const toneStatus = documentToneStatus[tone];
  const facts = toneStatus
    ? { status: { tone: toneStatus, label: state, testId: stateTestId } }
    : { detail: <span data-testid={stateTestId}>{state}</span>, status };
  const pdfCommand =
    pdf && opening && "onClick" in opening ? (
      <OpenPdfCommand testId={`${testId}-pdf`} onClick={opening.onClick} disabled={opening.disabled} />
    ) : null;
  const shared = {
    "data-testid": testId,
    head: <ListRowIcon nature="council">{icon}</ListRowIcon>,
    title: name,
    action:
      pdfCommand || actions ? (
        <>
          {pdfCommand}
          {actions}
        </>
      ) : undefined,
    children: Children.toArray(children).length ? children : undefined,
    ...facts,
  };
  if (!opening) return <ListRow {...shared} />;
  if ("to" in opening) return <ListRow {...shared} to={opening.to} openTestId={`${testId}-open`} />;
  return (
    <ListRow
      {...shared}
      onOpen={opening.onClick}
      openTestId={`${testId}-open`}
      openProps={{ disabled: opening.disabled }}
    />
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
// @implements-requirement HALL-FR-NOT-160
export function MeetingDocumentsSection({
  meetingActions,
  aggregate,
}: {
  meetingActions: ReturnType<typeof useCouncilMeeting>;
  aggregate: LiveMeetingPresentation;
}) {
  const { t, plural, formatDate, formatDateTime, formatNumber } = useI18n();
  const navigate = useNavigate();
  const phone = usePhoneLayout();
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
  const currentNotice = notices.find((notice) => notice.id === agendaRevision.noticeId);
  const hasNotice = Boolean(agendaRevision.noticeId);
  const previousNotices = notices.filter((notice) => !revisionEstablished || notice.revision !== agendaRevision.number);

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
    setViewer({ title: `${t("meeting.notice.title")} · ${meetingLabel}`, href: await meetingNoticeContentHref(id) });
  };
  const showDecision = async (id: string, title: string) => {
    const opened = await openCouncilDecisionDocument(id);
    const link = opened.representation ? findSirenLink(opened.representation, "content") : undefined;
    if (link) setViewer({ title, href: link.href });
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
    if (hasNotice) return { text: t("common.loading"), tone: "neutral" };
    if (revisionEstablished)
      return {
        text: t("meeting.documents.noticeMissing", { number: formatNumber(agendaRevision.number) }),
        tone: "pending",
      };
    if (preparing)
      return {
        text: t("meeting.documents.noticeOpenRevision", { number: formatNumber(agendaRevision.number) }),
        tone: "pending",
      };
    return { text: t("meeting.notice.empty"), tone: "neutral" };
  };

  const canDossier = meetingActions.can("meeting.generate-dossier");
  const dossierHref = `/api/council-meetings/${meeting.id}/dossier`;

  const attendanceSheetHref = meetingActions.link("attendance-sheet");
  const proxyFormHref = meetingActions.link("proxy-form");
  const showAttendanceSheet = () => {
    if (attendanceSheetHref)
      setViewer({ title: `${t("meeting.attendanceSheet")} · ${meetingLabel}`, href: attendanceSheetHref });
  };
  const deliberationListHref = meetingActions.link("deliberation-list");

  const [minutesState, setMinutesState] = useState<{ generatedAt: string | null; settled: boolean } | null>(null);
  useEffect(() => {
    if (!closed || !meeting.minutesId) return;
    let active = true;
    void openMinutes(meeting.minutesId).then(
      (result) => {
        if (active)
          setMinutesState({
            generatedAt: result.data.documentId ? result.data.generatedAt : null,
            settled: Boolean(result.data.settledAt),
          });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [closed, meeting.minutesId]);

  const decisionRecords = useCouncilDecisionsStore((state) => state.councilDecisions);
  useEffect(() => {
    if (closed) void useCouncilDecisionsStore.getState().load();
  }, [closed]);
  const decisions = closed
    ? [...aggregate.agendaItems]
        .sort((left, right) => left.position - right.position)
        .flatMap((item) => {
          const record = decisionRecords.find((candidate) => candidate.proposalId === item.business.councilDecisionId);
          return record
            ? [
                {
                  id: record.id,
                  publicationNumber: record.number,
                  frozen: record.state === "frozen",
                  agendaNumber: item.agendaNumber,
                  title: liveBusinessTitle(item.business, t("agendaSubject.minutesApproval")),
                },
              ]
            : [];
        })
    : [];

  const notice = noticeState();
  const showNoticeRow = Boolean(noticesHref) || canGenerateNotice;

  const documentsContent = (
    <>
      <RequestErrorBanner error={error} />
      <RequestErrorBanner error={meetingActions.actionError} />
      <ListRows data-wrap="true" data-layout-flow="true">
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
            pdf
            state={notice.text}
            tone={notice.tone}
            actions={
              <>
                {revisionEstablished && canGenerateNotice ? (
                  <Button
                    variant={hasNotice ? "secondary" : "primary"}
                    data-testid={hasNotice ? "meeting-notice-regenerate" : "meeting-generate-notice"}
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
                    {t(
                      submitting
                        ? "common.saving"
                        : hasNotice
                          ? "meeting.notice.regenerate"
                          : "meeting.notice.generate",
                    )}
                  </Button>
                ) : null}
                {canExportNotice && message && preparing && currentNotice ? (
                  <Button
                    variant="secondary"
                    data-testid="meeting-export-notice-message"
                    disabled={submitting || !message.canGenerate}
                    onClick={() =>
                      perform(async () => {
                        const message = await prepareMeetingNoticeMail(meeting.reference, currentNotice.id);
                        navigate(`/mail/drafts/${message.id}`);
                      })
                    }
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
                  variant="plain"
                  className="meeting-document-toggle"
                  aria-expanded={previousOpen}
                  data-testid="meeting-notice-previous-toggle"
                  onClick={() => setPreviousOpen((value) => !value)}
                >
                  <DisclosureBadge expanded={previousOpen} />
                  {plural(
                    previousNotices.length,
                    "meeting.documents.previousNotices.one",
                    "meeting.documents.previousNotices.other",
                  )}
                </Button>
                {previousOpen ? (
                  <ListRows data-testid="meeting-notice-previous-list">
                    {previousNotices.map((version) => (
                      <ListRow
                        key={version.id}
                        onOpen={() => perform(() => showNotice(version.id))}
                        openTestId={`meeting-notice-preview-${version.id}`}
                        openProps={{ disabled: submitting }}
                        head={
                          <ListRowIcon nature="council">
                            <NoticeIcon />
                          </ListRowIcon>
                        }
                        title={t("meeting.documents.previousNotice", {
                          number: formatNumber(version.revision),
                          date: formatDateTime(version.revisionEstablishedAt),
                        })}
                      />
                    ))}
                  </ListRows>
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
            pdf
            state={revisionEstablished ? "" : t("meeting.documents.dossierAfterRevision")}
            actions={revisionEstablished ? <HelpHint text={t("meeting.dossierDescription")} /> : undefined}
          />
        ) : null}

        {closed && meeting.minutesId ? (
          <DocumentRow
            testId="meeting-document-minutes"
            icon={<MinutesIcon />}
            name={t("meeting.minutes")}
            state={
              minutesState === null
                ? t("common.loading")
                : minutesState.generatedAt
                  ? t("meeting.documents.minutesGenerated", { date: formatDate(minutesState.generatedAt) })
                  : t("minutes.draft")
            }
            status={
              minutesState
                ? {
                    tone: minutesState.settled ? "success" : "action",
                    label: t(minutesState.settled ? "minutes.stopped" : "minutes.notStopped"),
                    testId: "meeting-document-minutes-settlement",
                  }
                : undefined
            }
            opening={
              minutesState?.generatedAt
                ? {
                    onClick: () =>
                      setViewer({
                        title: `${t("meeting.minutes")} · ${meetingLabel}`,
                        href: minutesContentHref(meeting.minutesId!),
                      }),
                  }
                : { to: `/minutes/${meeting.minutesId}` }
            }
            pdf
            actions={
              <Link
                className="hall-link"
                to={`/minutes/${meeting.minutesId}`}
                data-testid="meeting-document-minutes-writing"
              >
                {t("meeting.documents.writing")}
              </Link>
            }
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
            pdf
            state={t("meeting.documents.deliberationListState")}
          />
        ) : null}

        {attendanceSheetHref ? (
          <DocumentRow
            testId="meeting-document-attendance-sheet"
            icon={<AttendanceSheetIcon />}
            name={t("meeting.attendanceSheet")}
            opening={{ onClick: showAttendanceSheet }}
            pdf
            state={t("meeting.documents.available")}
            tone="done"
            actions={
              <Button variant="secondary" data-testid="meeting-attendance-sheet-print" onClick={showAttendanceSheet}>
                <PrintIcon aria-hidden="true" />
                {t("meeting.documents.print")}
              </Button>
            }
          />
        ) : null}

        {proxyFormHref ? (
          <DocumentRow
            testId="meeting-document-proxy-form"
            icon={<ProxyIcon />}
            name={t("meeting.proxyForm")}
            state={t("meeting.documents.proxyFormState")}
            actions={
              <Button variant="secondary" data-testid="meeting-proxy-form-open" onClick={() => setProxyOpen(true)}>
                <PrintIcon aria-hidden="true" />
                {t("meeting.proxyFormOpen")}
              </Button>
            }
          />
        ) : null}
      </ListRows>
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
    </>
  );
  const documents = closed ? (
    <section className="collapsible-section meeting-documents" data-testid="meeting-documents">
      <SectionHeader title={t("meeting.documents.title")} />
      <div className="collapsible-section-content">{documentsContent}</div>
    </section>
  ) : (
    <CollapsibleSection
      title={t("meeting.documents.title")}
      open={open}
      onOpenChange={setOpen}
      testId="meeting-documents"
      className="meeting-documents"
    >
      {documentsContent}
    </CollapsibleSection>
  );
  return (
    <>
      {documents}
      {closed ? (
        <section className="meeting-decisions" data-testid="meeting-document-decisions">
          <SectionHeader
            title={t("meeting.documents.decisions")}
            count={formatNumber(decisions.length)}
            countTestId="meeting-document-decisions-count"
          />
          {decisions.length ? (
            <ListRows data-wrap="true" data-layout-flow="true">
              {decisions.map((decision) => {
                const openPdf = () => perform(() => showDecision(decision.id, decision.title));
                const number = decision.publicationNumber
                  ? t("meeting.documents.decisionNumber", { number: decision.publicationNumber })
                  : null;
                return (
                  <ListRow
                    key={decision.id}
                    data-testid={`meeting-decision-${decision.id}`}
                    {...(decision.frozen
                      ? {
                          onOpen: openPdf,
                          openProps: { disabled: submitting },
                        }
                      : { to: `/council-decisions/${decision.id}` })}
                    openTestId={`meeting-decision-link-${decision.id}`}
                    {...(phone
                      ? { overline: number ?? undefined }
                      : { head: <span className="meeting-decision-number">{number}</span> })}
                    title={decision.title}
                    detail={
                      decision.agendaNumber === null
                        ? undefined
                        : t("meeting.documents.decisionPoint", { number: formatNumber(decision.agendaNumber) })
                    }
                    status={{
                      tone: decision.frozen ? "success" : "action",
                      label: t(decision.frozen ? "decisionDocument.frozen" : "decisionDocument.draft"),
                      testId: `meeting-decision-state-${decision.id}`,
                    }}
                    action={
                      decision.frozen ? (
                        <OpenPdfCommand
                          testId={`meeting-decision-pdf-${decision.id}`}
                          onClick={openPdf}
                          disabled={submitting}
                        />
                      ) : (
                        <Link
                          className="hall-link"
                          to={`/council-decisions/${decision.id}`}
                          data-testid={`meeting-decision-writing-${decision.id}`}
                        >
                          {t("meeting.documents.writing")}
                        </Link>
                      )
                    }
                  />
                );
              })}
            </ListRows>
          ) : (
            <p className="meeting-document-note">{t("meeting.documents.decisionsEmpty")}</p>
          )}
        </section>
      ) : null}
      {viewer ? (
        <DocumentObjectViewer
          title={viewer.title}
          objectUrl={viewer.href}
          mediaType="application/pdf"
          onClose={() => setViewer(null)}
        />
      ) : null}
    </>
  );
}
