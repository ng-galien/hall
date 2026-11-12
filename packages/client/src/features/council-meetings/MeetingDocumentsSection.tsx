// biome-ignore-all lint/correctness/useExhaustiveDependencies: Notice and minutes changes intentionally reload their state.
import type { MeetingNotice, MeetingNoticeMessagePreparation } from "@hall/api-contract";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
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
import { ListRow, ListRowIcon, ListRowNumber, type ListRowStatusTone, ListRows } from "../../components/ui/list-row";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import {
  generateMeetingNotice,
  listMeetingNotices,
  meetingNoticeContentHref,
  prepareMeetingNoticeMail,
  prepareMeetingNoticeMessage,
} from "../../services/meetingNoticesApi";
import { openMinutes } from "../../services/minutesApi";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { liveBusinessTitle } from "../council-business/presentation";
import { DocumentObjectViewer } from "../documents/DocumentObjectViewer";
import { MeetingNoticeDeadline } from "./MeetingNoticeDeadline";
import { MeetingProxyFormDialog } from "./MeetingProxyFormDialog";
import { formatMeetingLabel } from "./meetingPresentation";

/** A document is available, not yet established (a fact, never a request), or in default. */
type DocumentTone = "done" | "pending" | "error" | "neutral";

type DocumentOpening = { onClick: () => void; disabled?: boolean } | { to: string };

const documentToneStatus: Record<Exclude<DocumentTone, "neutral">, ListRowStatusTone> = {
  done: "success",
  pending: "neutral",
  error: "danger",
};

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
  const stateTestId = `${testId}-state`;
  const facts =
    tone === "neutral"
      ? { detail: <span data-testid={stateTestId}>{state}</span> }
      : { status: { tone: documentToneStatus[tone], label: state, testId: stateTestId } };
  const shared = {
    "data-testid": testId,
    head: <ListRowIcon nature="council">{icon}</ListRowIcon>,
    title: name,
    action: actions,
    children,
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
                  number: item.agendaNumber,
                  title: liveBusinessTitle(item.business, t("agendaSubject.minutesApproval")),
                },
              ]
            : [];
        })
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
      <ListRows>
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
            state={revisionEstablished ? t("meeting.dossierDescription") : t("meeting.documents.dossierAfterRevision")}
          />
        ) : null}

        {attendanceSheetHref ? (
          <DocumentRow
            testId="meeting-document-attendance-sheet"
            icon={<AttendanceSheetIcon />}
            name={t("meeting.attendanceSheet")}
            opening={{ onClick: showAttendanceSheet }}
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
            tone={minutesGenerated ? "done" : minutesGenerated === false ? "pending" : "neutral"}
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
              <ListRows>
                {decisions.map((decision) => (
                  <ListRow
                    key={decision.id}
                    to={`/council-decisions/${decision.id}`}
                    openTestId={`meeting-decision-link-${decision.id}`}
                    head={
                      decision.number === null ? (
                        <ListRowIcon nature="council">
                          <DecisionsIcon />
                        </ListRowIcon>
                      ) : (
                        <ListRowNumber number={formatNumber(decision.number)} />
                      )
                    }
                    title={decision.title}
                  />
                ))}
              </ListRows>
            ) : null}
          </DocumentRow>
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
