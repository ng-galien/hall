import { matchDiscriminated, matchLiteral } from "@hall/domain";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DisclosureBadge } from "@/components/ui/disclosure-badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createStageProgress } from "@/components/ui/stage-progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownEditor } from "../../../components/editor/MarkdownEditor";
import {
  AddIcon,
  CalendarAddIcon,
  CheckIcon,
  CollapseIcon,
  ExpandIcon,
  FileIcon,
  GavelIcon,
  InfoIcon,
  LockIcon,
  MembersIcon,
  PlayIcon,
  WarningIcon,
} from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { ResourceSearchField } from "../../../components/search/ResourceSearchField";

const itemStages = [
  { id: "0", icon: <FileIcon /> },
  { id: "1", icon: <MembersIcon /> },
  { id: "2", icon: <GavelIcon /> },
  { id: "3", icon: <CheckIcon /> },
] as const;
const VotingItemProgress = createStageProgress(itemStages);
const DiscussionItemProgress = createStageProgress([itemStages[0], itemStages[1], { id: "2", icon: <CheckIcon /> }]);

import { Modal, RequestErrorBanner } from "../../../components/Ui";
import { ListRow, ListRowIcon, ListRows } from "../../../components/ui/list-row";
import { liveBusinessTitle } from "../../../features/council-business/presentation";
import { AgendaItemRecusalDialog } from "../../../features/council-meetings/AgendaItemRecusalDialog";
import { agendaSubjectPresentation } from "../../../features/council-meetings/AgendaSubjectGlyph";
import { ballotVerdictKey } from "../../../features/council-meetings/ballotVerdictPresentation";
import { ConductActionBlockers } from "../../../features/council-meetings/ConductActionBlockers";
import { MeetingClosedSessionDialog } from "../../../features/council-meetings/MeetingClosedSessionDialog";
import { MeetingOfficersDialog, OfficerChangeRow } from "../../../features/council-meetings/MeetingOfficersDialog";
import { MeetingReconvocationForm } from "../../../features/council-meetings/MeetingReconvocationForm";
import { quorumFailureAwaitingReconvocation } from "../../../features/council-meetings/reconvocationPolicy";
import { recusalBasisLabel } from "../../../features/council-meetings/recusalPresentation";
import { DocumentaryResourceGlyph } from "../../../features/documents/DocumentaryResourceGlyph";
import { ResourcePreview } from "../../../features/documents/ResourcePreview";
import { useResourceImageUpload } from "../../../features/documents/useResourceImageUpload";
import { useAgendaItemNotesAutosave } from "../../../hooks/useAgendaItemNotesAutosave";
import { useAgendaItemRecusals } from "../../../hooks/useAgendaItemRecusals";
import type { useCouncilMeeting } from "../../../hooks/useCouncilMeeting";
import { useReferenceMentionables } from "../../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../../hooks/useSubmitting";
import type { TranslationKey } from "../../../i18n/en";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../../models/directory";
import type {
  LiveMeetingAgendaItem as AgendaItem,
  LiveAgendaItemStatus,
  LiveMeetingCouncilDecision,
  LiveMeetingPresentation,
} from "../../../models/liveMeeting";
import { agendaItemDecisionId, pendingBallotDecisions } from "../ballotDecisionPolicy";
import { councilMemberName } from "../ballotParticipants";
import { useConductAgendaSelection } from "./useConductAgendaSelection";
import { VotePanel } from "./VotePanel";

const RAIL_WIDTH_KEY = "mairie.live.railWidth";
const RAIL_MIN_WIDTH = 280;
const RAIL_MAX_WIDTH = 560;

function ConductBlockTitle({ title }: { title: string }) {
  return (
    <>
      <DisclosureBadge />
      <span>{title}</span>
    </>
  );
}

function storedRailWidth(): number {
  try {
    const stored = Number(localStorage.getItem(RAIL_WIDTH_KEY));
    if (Number.isFinite(stored) && stored >= RAIL_MIN_WIDTH) return Math.min(stored, RAIL_MAX_WIDTH);
  } catch {
    return 320;
  }
  return 320;
}

function persistRailWidth(width: number): boolean {
  try {
    localStorage.setItem(RAIL_WIDTH_KEY, String(width));
    return true;
  } catch {
    return false;
  }
}

function elapsedSince(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const parts = hours > 0 ? [hours, minutes, remainder] : [minutes, remainder];
  return parts.map((value) => String(value).padStart(2, "0")).join(":");
}

// @implements-requirement HALL-FR-MTG-360
interface ConductSubjectText {
  title: TranslationKey;
  markdown: string | null;
  toggleTestId: string;
}

function conductSubjectText(
  subject: AgendaItem["subject"],
  decision: LiveMeetingCouncilDecision | null,
): ConductSubjectText | null {
  return matchDiscriminated(subject, "kind", {
    councilDecisionProposal: (): ConductSubjectText | null =>
      decision
        ? { title: "meeting.draftDecision", markdown: decision.draftText || null, toggleTestId: "live-proposal-toggle" }
        : null,
    openQuestion: ({ content }): ConductSubjectText | null =>
      content.trim()
        ? {
            title: agendaSubjectPresentation.openQuestion.label,
            markdown: content,
            toggleTestId: "live-open-question-toggle",
          }
        : null,
    minutesApproval: (): ConductSubjectText | null => null,
  });
}

// @implements-requirement HALL-FR-MTG-320
// @implements-requirement HALL-FR-MTG-350 (the agenda items examined in closed session are marked)
export function ConductView({
  aggregate,
  members,
  meetingActions,
  onShowRollCall,
}: {
  aggregate: LiveMeetingPresentation;
  members: CouncilMemberView[];
  meetingActions: ReturnType<typeof useCouncilMeeting>;
  onShowRollCall(): void;
}) {
  const { canUpload: canUploadImage, uploadImage } = useResourceImageUpload();
  const { t, formatTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const navigate = useNavigate();
  const { orderedItems, activeItem, nextItem, selectedItem, setSelectedItemId, openingSelected, setOpeningSelected } =
    useConductAgendaSelection(aggregate.agendaItems, meetingActions.liveRevision, {
      conducts: meetingActions.conducts,
    });
  const [adjournConfirming, setAdjournConfirming] = useState(false);
  const [ballotActionContainer, setBallotActionContainer] = useState<HTMLDivElement | null>(null);
  const mentionables = useReferenceMentionables();
  const [voteOpen, setVoteOpen] = useState(false);
  const [viewedResourceId, setViewedResourceId] = useState<string | null>(null);
  const [closeConfirming, setCloseConfirming] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [questionBusiness, setQuestionBusiness] = useState<{ id: string; label: string } | "new" | null>(null);
  const closeAddItem = () => {
    setAddItemOpen(false);
    setQuestionBusiness(null);
  };
  const [railWidth, setRailWidth] = useState(storedRailWidth);

  const startRailResize = (event: ReactPointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = railWidth;
    const onMove = (moveEvent: PointerEvent) => {
      setRailWidth(Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, startWidth + moveEvent.clientX - startX)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setRailWidth((width) => {
        persistRailWidth(width);
        return width;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const ballotForItem = (item: AgendaItem) => {
    const decisionId = agendaItemDecisionId(item);
    return (
      aggregate.ballots.find(
        (ballot) =>
          !ballot.cancelledAt &&
          ballot.result !== null &&
          (ballot.agendaItemId === item.id || (decisionId && ballot.councilDecisionId === decisionId)),
      ) ?? null
    );
  };

  const selectedItemId2 = selectedItem?.id ?? null;
  const recusals = useAgendaItemRecusals(
    aggregate.meeting.id,
    selectedItemId2,
    `${selectedItem?.status}:${aggregate.ballots.length}:${JSON.stringify(aggregate.attendance)}`,
  );
  const [recusalOpen, setRecusalOpen] = useState(false);
  const [officersOpen, setOfficersOpen] = useState(false);
  const [closedSessionOpen, setClosedSessionOpen] = useState(false);
  const [recusalDetailsOpen, setRecusalDetailsOpen] = useState(false);
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;
  useEffect(() => {
    if (selectedItemRef.current?.id !== selectedItemId2) return;
    setVoteOpen(false);
    setRecusalOpen(false);
    setRecusalDetailsOpen(false);
  }, [selectedItemId2]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const notesAutosave = useAgendaItemNotesAutosave({
    itemId: selectedItemId2,
    serverText: selectedItem?.discussionSummary ?? "",
    active: selectedItem?.status === "inProgress",
    save: meetingActions.saveAgendaItemNotes,
  });
  const notes = notesAutosave.text;

  if (!selectedItem) {
    return (
      <section className="conduct-empty">
        <p>{t("meeting.emptyAgenda")}</p>
      </section>
    );
  }

  const selectedDecisionId = agendaItemDecisionId(selectedItem);
  const conduct = meetingActions.workspace?.conduct ?? null;
  const closedSessionItemIds = new Set(conduct?.closedSessions.flatMap((session) => session.agendaItemIds) ?? []);
  const meetingBlockers = conduct?.meetingActionBlockers;
  const quorumFailure = quorumFailureAwaitingReconvocation(conduct);
  const blockerMemberName = (memberId: string) => councilMemberName(members, memberId);
  const blockers = meetingActions.workspace?.agendaItems.find((item) => item.id === selectedItem.id)?.conductBlockers;
  const selectedDecision = selectedDecisionId
    ? (aggregate.councilDecisions.find((decision) => decision.id === selectedDecisionId) ?? null)
    : null;
  const subjectText = conductSubjectText(selectedItem.subject, selectedDecision);
  const selectedBallot = ballotForItem(selectedItem);
  const itemResources = selectedItem.business.resources;
  const hasVotingStage = Boolean(selectedDecisionId) || selectedItem.business.kind === "minutesApproval";
  const progressLabels = [
    t("live.progressScheduled"),
    t("live.progressDiscussion"),
    ...(hasVotingStage ? [t("live.progressVote")] : []),
    t(
      selectedItem.status === "adjourned"
        ? "status.adjourned"
        : hasVotingStage
          ? "live.progressResult"
          : "live.progressCompleted",
    ),
  ];
  const progressIndex = matchLiteral(selectedItem.status, {
    scheduled: () => 0,
    inProgress: () => (hasVotingStage && voteOpen ? 2 : 1),
    examined: () => progressLabels.length - 1,
    adjourned: () => progressLabels.length - 1,
    carriedForward: () => progressLabels.length - 1,
  });
  const isActive = selectedItem.status === "inProgress";
  const isNext = !activeItem && nextItem?.id === selectedItem.id;
  const ballotParticipants =
    isActive &&
    !selectedBallot &&
    meetingActions.can("ballot.record", selectedItem.id) &&
    (!selectedDecision || pendingBallotDecisions(aggregate).some((decision) => decision.id === selectedDecision.id))
      ? recusals.state
      : null;
  const continuation =
    isNext && meetingActions.can("agenda-item.start", selectedItem.id)
      ? "start"
      : ballotParticipants
        ? "vote"
        : isActive && meetingActions.can("agenda-item.complete", selectedItem.id)
          ? "complete"
          : "none";
  const continuationBlockers = isNext
    ? blockers?.startDiscussion
    : isActive
      ? hasVotingStage
        ? blockers?.reviewBallot
        : blockers?.complete
      : [];
  const remainingCount = orderedItems.filter((item) => !item.completedAt).length;

  const completeItem = (status: Extract<LiveAgendaItemStatus, "examined">) =>
    run(async () => {
      if (!(await notesAutosave.flush())) return false;
      const completed = await meetingActions.completeAgendaItem(selectedItem.id, {
        discussionSummary: notes,
        status,
      });
      if (completed) setSelectedItemId(null);
      return completed;
    });

  const createSessionQuestion = (input: Parameters<typeof meetingActions.addOpenQuestion>[0]) =>
    run(async () => {
      const added = await meetingActions.addOpenQuestion(input);
      if (added) closeAddItem();
      return added;
    });

  const closeMeeting = () => {
    if (!closeConfirming) {
      setCloseConfirming(true);
      return;
    }
    void run(async () => {
      if (!(await notesAutosave.flush())) return false;
      const closed = await meetingActions.close();
      if (closed) navigate("/meetings");
      return closed;
    });
  };

  return (
    <div className="conduct">
      <aside
        data-testid="live-agenda-rail"
        className={`conduct-rail${railCollapsed ? " conduct-rail-collapsed" : ""}`}
        style={railCollapsed ? undefined : { width: railWidth }}
        aria-label={t("meeting.timeline")}
      >
        <div className="conduct-rail-header">
          {!railCollapsed ? (
            <>
              <span className="live-eyebrow">{t("meeting.agenda")}</span>
              <span className="conduct-rail-progress">
                {formatNumber(orderedItems.length - remainingCount)} / {formatNumber(orderedItems.length)}
              </span>
            </>
          ) : null}
          <Button
            variant="plain"
            size="icon"
            data-testid="live-agenda-toggle"
            aria-label={t(railCollapsed ? "live.railExpand" : "live.railCollapse")}
            onClick={() => setRailCollapsed((collapsed) => !collapsed)}
          >
            {railCollapsed ? <ExpandIcon /> : <CollapseIcon />}
          </Button>
        </div>
        <ol className="conduct-timeline">
          {aggregate.meeting.openedAt ? (
            <li className="conduct-step conduct-step-done">
              <Button
                variant="plain"
                className="conduct-step-button"
                data-active={openingSelected ? "true" : undefined}
                data-testid="live-opening"
                aria-label={t("live.openingStep")}
                aria-current={openingSelected ? "true" : undefined}
                onClick={() => setOpeningSelected(true)}
              >
                <span className="conduct-step-marker" aria-hidden="true">
                  <CheckIcon />
                </span>
                {!railCollapsed ? (
                  <span className="conduct-step-copy">
                    <strong>{t("live.openingStep")}</strong>
                    <span>
                      {formatTime(aggregate.meeting.openedAt)}
                      {aggregate.meeting.chairMemberId
                        ? ` · ${councilMemberName(members, aggregate.meeting.chairMemberId)}`
                        : ""}
                    </span>
                  </span>
                ) : null}
              </Button>
            </li>
          ) : null}
          {orderedItems.map((item) => {
            const itemActive = Boolean(item.status === "inProgress");
            const itemDone = item.status === "examined" || item.status === "adjourned";
            const state = itemActive ? "active" : itemDone ? "done" : "upcoming";
            const itemBallot = ballotForItem(item);
            const voteRequired = Boolean(agendaItemDecisionId(item)) && !itemBallot && !itemDone;
            const stepButton = (
              <Button
                variant="plain"
                className="conduct-step-button"
                data-active={!openingSelected && selectedItem.id === item.id ? "true" : undefined}
                data-testid={`live-agenda-item-${item.id}`}
                disabled={submitting}
                aria-label={
                  railCollapsed ? liveBusinessTitle(item.business, t("agendaSubject.minutesApproval")) : undefined
                }
                aria-current={!openingSelected && selectedItem.id === item.id ? "true" : undefined}
                onClick={() =>
                  void run(async () => {
                    if (!(await notesAutosave.flush())) return false;
                    setOpeningSelected(false);
                    setSelectedItemId(item.id);
                    return true;
                  })
                }
              >
                <span className="conduct-step-marker" aria-hidden="true">
                  {itemDone ? <CheckIcon /> : itemActive ? <PlayIcon /> : item.agendaNumber}
                </span>
                {!railCollapsed ? (
                  <span className="conduct-step-copy">
                    <strong>{liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}</strong>
                    {closedSessionItemIds.has(item.id) ? (
                      <span data-testid={`live-agenda-item-closed-session-${item.id}`}>{t("closedSession.mark")}</span>
                    ) : null}
                    {!itemBallot ? (
                      <span>
                        {itemActive
                          ? t("live.progressDiscussion")
                          : item.startedAt
                            ? formatTime(item.startedAt)
                            : t("meeting.subjectUpcoming")}
                      </span>
                    ) : null}
                    {itemBallot ? (
                      <span
                        className="list-row-status"
                        data-tone={itemBallot.result === "adopted" ? "success" : "danger"}
                      >
                        {t(ballotVerdictKey(item.subjectKind === "minutesApproval", itemBallot.result === "adopted"))}{" "}
                        {formatNumber(itemBallot.votesFor)} · {formatNumber(itemBallot.votesAgainst)} ·{" "}
                        {formatNumber(itemBallot.abstentions)}
                      </span>
                    ) : voteRequired ? (
                      <span className="list-row-status" data-tone="warning">
                        {t("live.voteRequired")}
                      </span>
                    ) : null}
                    {itemDone && item.status !== "examined" ? (
                      <span className="conduct-step-state">{t("status.adjourned")}</span>
                    ) : null}
                  </span>
                ) : null}
              </Button>
            );
            return (
              <li className={`conduct-step conduct-step-${state}`} key={item.id}>
                {railCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{stepButton}</TooltipTrigger>
                    <TooltipContent className="step-tooltip" side="right">
                      <span className="step-tooltip-body">
                        <strong>{liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}</strong>
                        <span>
                          {item.startedAt ? formatTime(item.startedAt) : t("meeting.subjectUpcoming")}
                          {item.completedAt ? ` → ${formatTime(item.completedAt)}` : ""}
                        </span>
                        {itemBallot ? (
                          <span className={`step-tooltip-ballot step-tooltip-ballot-${itemBallot.result}`}>
                            {t(
                              ballotVerdictKey(item.subjectKind === "minutesApproval", itemBallot.result === "adopted"),
                            )}{" "}
                            {formatNumber(itemBallot.votesFor)} · {formatNumber(itemBallot.votesAgainst)} ·{" "}
                            {formatNumber(itemBallot.abstentions)}
                          </span>
                        ) : voteRequired ? (
                          <span className="step-tooltip-flag">{t("live.voteRequired")}</span>
                        ) : null}
                        {itemDone && item.status !== "examined" ? <span>{t("status.adjourned")}</span> : null}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  stepButton
                )}
              </li>
            );
          })}
        </ol>
        <div className="conduct-rail-footer">
          <Button
            variant="secondary"
            className="conduct-rail-tool"
            title={railCollapsed ? t("live.addItem") : undefined}
            data-testid="live-agenda-add"
            disabled={submitting || !meetingActions.can("meeting.add-open-question")}
            onClick={() => setAddItemOpen(true)}
          >
            <AddIcon aria-hidden="true" />
            {!railCollapsed ? t("live.addItem") : null}
          </Button>
          <ConductActionBlockers
            action="add-agenda-item"
            label="live.addItem"
            blockers={meetingBlockers?.addAgendaItem ?? []}
          />
          <Button
            variant="secondary"
            className="conduct-rail-tool"
            title={railCollapsed ? t("live.adjustAttendance") : undefined}
            data-testid="live-attendance-adjust"
            disabled={!meetingActions.can("meeting.record-attendance-events")}
            onClick={onShowRollCall}
          >
            <MembersIcon aria-hidden="true" />
            {!railCollapsed ? t("live.adjustAttendance") : null}
          </Button>
          <ConductActionBlockers
            action="attendance"
            label="live.adjustAttendance"
            blockers={meetingBlockers?.recordAttendanceEvents ?? []}
          />
          <Button
            variant="secondary"
            className="conduct-rail-tool"
            title={railCollapsed ? t("officers.title") : undefined}
            data-testid="live-officers-open"
            disabled={!conduct}
            onClick={() => setOfficersOpen(true)}
          >
            <GavelIcon aria-hidden="true" />
            {!railCollapsed ? t("officers.title") : null}
          </Button>
          <Button
            variant="secondary"
            className="conduct-rail-tool"
            title={railCollapsed ? t("closedSession.title") : undefined}
            data-testid="live-closed-session-open"
            disabled={!conduct || !meetingActions.can("meeting.record-closed-session")}
            onClick={() => setClosedSessionOpen(true)}
          >
            <LockIcon aria-hidden="true" />
            {!railCollapsed ? t("closedSession.title") : null}
          </Button>
          {quorumFailure && meetingActions.can("meeting.record-reconvocation") ? (
            <MeetingReconvocationForm
              observation={quorumFailure}
              agendaItems={meetingActions.workspace?.agendaItems ?? []}
              onSubmit={meetingActions.recordReconvocation}
              error={meetingActions.actionError}
              trigger={({ open, disabled, label }) => (
                <Button
                  variant="secondary"
                  className="conduct-rail-tool"
                  title={railCollapsed ? label : undefined}
                  data-testid="live-reconvocation-open"
                  disabled={disabled}
                  onClick={open}
                >
                  <CalendarAddIcon aria-hidden="true" />
                  {!railCollapsed ? label : null}
                </Button>
              )}
            />
          ) : null}
          <Button
            variant="secondary"
            className="conduct-rail-tool"
            disabled={submitting || !meetingActions.can("meeting.close")}
            aria-busy={submitting && closeConfirming}
            data-testid="live-meeting-close"
            title={railCollapsed ? t("meeting.action.close") : undefined}
            onClick={closeMeeting}
            onBlur={() => setCloseConfirming(false)}
          >
            <WarningIcon aria-hidden="true" />
            {railCollapsed
              ? null
              : submitting && closeConfirming
                ? t("common.saving")
                : closeConfirming
                  ? remainingCount > 0
                    ? t("live.confirmCloseRemaining", { count: formatNumber(remainingCount) })
                    : t("live.confirmClose")
                  : t("meeting.action.close")}
          </Button>
          <ConductActionBlockers
            action="close"
            label="meeting.action.close"
            blockers={meetingActions.workspace?.meeting.closureBlockers ?? []}
          />
        </div>
        {!railCollapsed ? (
          <div className="conduct-rail-resizer" aria-hidden="true" onPointerDown={startRailResize} />
        ) : null}
      </aside>

      {openingSelected ? (
        <section className="conduct-stage" aria-labelledby="conduct-opening-title" data-testid="live-opening-summary">
          <header className="conduct-stage-header">
            <span className="live-eyebrow">
              {aggregate.meeting.openedAt ? formatTime(aggregate.meeting.openedAt) : ""}
            </span>
            <h2 id="conduct-opening-title">{t("live.openingStep")}</h2>
          </header>
          <div className="conduct-opening-content">
            <dl className="report-roll-call">
              <div>
                <dt>{t("meetings.chair")}</dt>
                <dd>{councilMemberName(members, aggregate.meeting.chairMemberId ?? "")}</dd>
              </div>
              <div>
                <dt>{t("meetings.secretary")}</dt>
                <dd>{councilMemberName(members, aggregate.meeting.secretaryMemberId ?? "")}</dd>
              </div>
              {conduct ? (
                <>
                  <div>
                    <dt>{t("officers.currentChair")}</dt>
                    <dd data-testid="live-current-chair">
                      {councilMemberName(members, conduct.currentOfficers.chairMemberId ?? "")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("officers.currentSecretary")}</dt>
                    <dd data-testid="live-current-secretary">
                      {councilMemberName(members, conduct.currentOfficers.secretaryMemberId ?? "")}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {conduct && conduct.officerChanges.length > 0 ? (
              <ListRows data-testid="live-opening-handovers">
                {conduct.officerChanges.map((change) => (
                  <OfficerChangeRow key={change.id} change={change} members={members} />
                ))}
              </ListRows>
            ) : null}
            {conduct && conduct.closedSessions.length > 0 ? (
              <ListRows data-testid="live-closed-sessions">
                {conduct.closedSessions.map((session) => (
                  <ListRow
                    key={session.id}
                    head={
                      <ListRowIcon nature="council">
                        <LockIcon />
                      </ListRowIcon>
                    }
                    title={t(session.wholeMeeting ? "closedSession.summaryWhole" : "closedSession.summaryItems", {
                      approvals: formatNumber(session.approvals),
                      count: formatNumber(session.presentOrRepresented),
                    })}
                    detail={formatTime(session.observedAt)}
                  />
                ))}
              </ListRows>
            ) : null}
            {conduct && conduct.auxiliaryAttendances.length > 0 ? (
              <section className="grid gap-1" data-testid="live-opening-auxiliaries">
                <strong>{t("auxiliary.title")}</strong>
                <ul>
                  {conduct.auxiliaryAttendances.map((entry) => (
                    <li key={entry.id}>{entry.quality ? `${entry.name} · ${entry.quality}` : entry.name}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <p>
              {t("meeting.quorumFailureEvidence", {
                present: formatNumber(aggregate.quorum.physicallyPresent),
                required:
                  aggregate.quorum.required === null
                    ? t("meeting.quorumUnestablished")
                    : formatNumber(aggregate.quorum.required),
              })}
            </p>
            <dl className="conduct-opening-roster">
              {aggregate.attendance.map((entry) => (
                <div key={entry.id}>
                  <dt>{councilMemberName(members, entry.memberId)}</dt>
                  <dd>
                    {t(`attendance.${entry.status}`)}
                    {entry.proxyHolderMemberId ? ` · ${councilMemberName(members, entry.proxyHolderMemberId)}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}
      <section
        className="conduct-stage conduct-stage-with-actions"
        hidden={openingSelected}
        aria-labelledby="conduct-item-title"
      >
        <header className="conduct-stage-header conduct-stage-fixed-header" data-testid="live-item-header">
          <span className="live-eyebrow">
            {t("live.itemEyebrow", {
              position: selectedItem.agendaNumber === null ? "" : formatNumber(selectedItem.agendaNumber),
            })}{" "}
            · {t(agendaSubjectPresentation[selectedItem.subjectKind].label)}
            {selectedItem.business.folderPath ? ` · ${selectedItem.business.folderPath}` : ""}
          </span>
          <div className="conduct-heading-row">
            <div className="conduct-title-timer">
              <h2 id="conduct-item-title" data-testid="live-item-title">
                {liveBusinessTitle(selectedItem.business, t("agendaSubject.minutesApproval"))}
              </h2>
              {isActive && selectedItem.startedAt ? (
                <div className="conduct-timer" role="timer" data-testid="live-item-timer">
                  <span className="live-indicator" aria-hidden="true" />
                  {elapsedSince(selectedItem.startedAt, now)}
                </div>
              ) : null}
            </div>
            {recusals.state && (recusals.canRecord || recusals.state.recusals.length > 0) ? (
              <Popover open={recusalDetailsOpen} onOpenChange={setRecusalDetailsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="secondary" className="conduct-recusal-trigger" data-testid="live-recusal-info">
                    <InfoIcon aria-hidden="true" />
                    {t("recusal.listTitle")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="conduct-recusal-popover"
                  data-testid="live-recusal-info-content"
                  aria-label={t("recusal.listTitle")}
                >
                  <section className="grid gap-3" data-testid="agenda-item-recusals">
                    <strong>{t("recusal.listTitle")}</strong>
                    {recusals.state.recusals.map((entry) => (
                      <p key={entry.id} data-testid={`agenda-item-recusal-${entry.councilMemberId}`}>
                        <strong>{entry.memberName}</strong> · {t(recusalBasisLabel(entry.legalBasis))}
                      </p>
                    ))}
                    {recusals.state.recusals.length > 0 ? (
                      <p className="text-muted">{t("recusal.separateFromVotes")}</p>
                    ) : null}
                    {recusals.canRecord ? (
                      <Button
                        variant="secondary"
                        data-testid="agenda-item-recusal-open"
                        onClick={() => {
                          setRecusalDetailsOpen(false);
                          setRecusalOpen(true);
                        }}
                      >
                        {t("recusal.title")}
                      </Button>
                    ) : null}
                  </section>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
          {hasVotingStage ? (
            <VotingItemProgress
              currentStep={String(progressIndex)}
              labels={progressLabels}
              label={t("live.progressLabel")}
              testId="live-item-progress"
              completedSteps={progressLabels.flatMap((_, index) =>
                index < progressIndex && (index !== 2 || Boolean(selectedBallot)) ? [String(index)] : [],
              )}
            />
          ) : (
            <DiscussionItemProgress
              currentStep={String(progressIndex)}
              labels={progressLabels}
              label={t("live.progressLabel")}
              testId="live-item-progress"
            />
          )}
          <RequestErrorBanner error={recusals.error} />
        </header>
        <div className="conduct-stage-scroll" data-testid="live-item-scroll">
          <div className="conduct-stage-body">
            {selectedItem.business.kind === "minutesApproval" ? (
              <Button asChild variant="secondary" className="conduct-minutes-link">
                <Link to={`/minutes/${selectedItem.business.minutesId}`} data-testid="live-minutes-link">
                  <FileIcon aria-hidden="true" />
                  {t("minutes.open")}
                </Link>
              </Button>
            ) : null}
            {selectedItem.business.report ? (
              <details className="conduct-block" open={!voteOpen} key={`report-${selectedItem.id}-${voteOpen}`}>
                <summary data-testid="live-report-toggle">
                  <ConductBlockTitle title={t("meeting.itemReport")} />
                </summary>
                <MarkdownView className="conduct-report" markdown={selectedItem.business.report} />
              </details>
            ) : null}

            {subjectText ? (
              <details
                className="conduct-block conduct-draft-decision"
                open={!voteOpen}
                key={`subject-text-${selectedItem.id}-${voteOpen}`}
              >
                <summary data-testid={subjectText.toggleTestId}>
                  <ConductBlockTitle title={t(subjectText.title)} />
                </summary>
                <blockquote>
                  {subjectText.markdown ? (
                    <MarkdownView markdown={subjectText.markdown} />
                  ) : (
                    t("decisions.textIncomplete")
                  )}
                </blockquote>
              </details>
            ) : null}

            {itemResources.length > 0 ? (
              <details className="conduct-block" open={!voteOpen} key={`documents-${selectedItem.id}-${voteOpen}`}>
                <summary data-testid="live-documents-toggle">
                  <ConductBlockTitle title={t("meeting.supportingDocuments")} />
                </summary>
                <div className="conduct-documents">
                  {itemResources.map((resource) => (
                    <Button
                      variant="secondary"
                      key={resource.id}
                      data-testid={`live-document-${resource.id}`}
                      onClick={() => setViewedResourceId(resource.id)}
                    >
                      <DocumentaryResourceGlyph resource={resource} />
                      {resource.title}
                    </Button>
                  ))}
                </div>
              </details>
            ) : null}

            {selectedItem.completedAt && selectedItem.discussionSummary ? (
              <details className="conduct-block" open key={`summary-${selectedItem.id}`}>
                <summary data-testid="live-discussion-summary-toggle">
                  <ConductBlockTitle title={t("meeting.observations")} />
                </summary>
                <MarkdownView className="conduct-report" markdown={selectedItem.discussionSummary} />
              </details>
            ) : null}

            {isActive ? (
              <details
                className="conduct-block"
                open={!voteOpen}
                key={`notes-${selectedItem.id}-${voteOpen}`}
                data-testid="live-agenda-notes"
              >
                <summary data-testid="live-notes-toggle">
                  <ConductBlockTitle title={t("meeting.observations")} />
                </summary>
                <MarkdownEditor
                  readOnly={!meetingActions.can("agenda-item.update-notes", selectedItem.id)}
                  mentionables={mentionables}
                  searchContext={selectedItem.business.folderPath}
                  onUploadImage={
                    canUploadImage
                      ? (file) => uploadImage(file, { kind: "agendaItemDiscussionSummary", id: selectedItem.id })
                      : undefined
                  }
                  markdown={notes}
                  placeholder={t("meeting.observationsDescription")}
                  onChange={notesAutosave.edit}
                  onBlur={() => {
                    void notesAutosave.flush();
                  }}
                />
              </details>
            ) : null}

            {ballotParticipants ? (
              <VotePanel
                key={selectedItem.id}
                aggregate={aggregate}
                members={members}
                eligibleAttendanceIds={ballotParticipants.eligibleParticipantAttendanceIds}
                departedAttendanceIds={ballotParticipants.departedParticipantAttendanceIds}
                ballotChair={ballotParticipants.ballotChair}
                actionContainer={ballotActionContainer}
                target={
                  selectedDecision ? { councilDecisionId: selectedDecision.id } : { agendaItemId: selectedItem.id }
                }
                isMinutes={selectedItem.subjectKind === "minutesApproval"}
                open={voteOpen}
                onOpenChange={setVoteOpen}
                onPreview={async (input) => {
                  if (!(await notesAutosave.flush())) throw new Error("The discussion notes could not be saved");
                  return meetingActions.previewBallot(input);
                }}
                onConfirm={async (preview) => {
                  if (!(await notesAutosave.flush())) throw new Error("The discussion notes could not be saved");
                  return meetingActions.confirmBallot(preview);
                }}
              />
            ) : null}

            {selectedBallot ? (
              <section
                className={`conduct-result conduct-result-${selectedBallot.result}`}
                aria-label={t("ballot.results")}
                data-testid="live-ballot-result"
              >
                <header className="conduct-result-header">
                  <div className="conduct-result-verdict">
                    <span className={`verdict-stamp verdict-stamp-${selectedBallot.result}`}>
                      {t(
                        ballotVerdictKey(
                          selectedItem.subjectKind === "minutesApproval",
                          selectedBallot.result === "adopted",
                        ),
                      )}
                    </span>
                    <div>
                      <span className="conduct-result-meta">
                        {t(selectedBallot.method === "public" ? "ballot.method.public" : "ballot.method.secret")} ·{" "}
                        {t("live.recordedAt", { time: formatTime(selectedBallot.createdAt) })}
                      </span>
                    </div>
                  </div>
                </header>
                <dl className="conduct-result-totals">
                  <div>
                    <dt>{t("ballot.votesFor")}</dt>
                    <dd>{formatNumber(selectedBallot.votesFor)}</dd>
                  </div>
                  <div>
                    <dt>{t("ballot.votesAgainst")}</dt>
                    <dd>{formatNumber(selectedBallot.votesAgainst)}</dd>
                  </div>
                  <div>
                    <dt>{t("ballot.abstentions")}</dt>
                    <dd>{formatNumber(selectedBallot.abstentions)}</dd>
                  </div>
                  <div>
                    <dt>{t("ballot.notVoting")}</dt>
                    <dd>{formatNumber(selectedBallot.notVoting)}</dd>
                  </div>
                </dl>
                {selectedBallot.method === "public" ? (
                  <div className="result-vote-groups">
                    {(
                      [
                        { choice: "for", labelKey: "ballot.votesFor" },
                        { choice: "against", labelKey: "ballot.votesAgainst" },
                        { choice: "abstain", labelKey: "ballot.abstentions" },
                        { choice: "notVoting", labelKey: "ballot.notVoting" },
                      ] as const
                    ).map((group) => {
                      const groupVotes = selectedBallot.votes.filter((vote) => vote.choice === group.choice);
                      if (groupVotes.length === 0) return null;
                      return (
                        <div className={`result-vote-group result-vote-group-${group.choice}`} key={group.choice}>
                          <h3>
                            {t(group.labelKey)} <span>{formatNumber(groupVotes.length)}</span>
                          </h3>
                          <div className="result-vote-pills">
                            {groupVotes.map((vote) => (
                              <span className={`result-vote-pill result-vote-pill-${group.choice}`} key={vote.memberId}>
                                {councilMemberName(members, vote.memberId)}
                                {vote.castByMemberId !== vote.memberId ? (
                                  <em>
                                    {" "}
                                    ·{" "}
                                    {t("live.proxyVoteSuffix", {
                                      holder: councilMemberName(members, vote.castByMemberId),
                                    })}
                                  </em>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <p className="report-ballot-note">
                  {t("ballot.expressedMajority", { expressed: formatNumber(selectedBallot.votesCast) })}
                </p>
                <p className="report-ballot-note">
                  {t("ballot.participationEvidence", {
                    present: formatNumber(selectedBallot.participationEvidence.quorum.physicallyPresent),
                    required:
                      selectedBallot.participationEvidence.quorum.required === null
                        ? t("meeting.quorumUnestablished")
                        : formatNumber(selectedBallot.participationEvidence.quorum.required),
                    roster: formatNumber(selectedBallot.participationEvidence.quorum.activeMembers),
                  })}
                </p>
                {selectedBallot.chairTieBreakApplied ? (
                  <p className="report-ballot-note">{t("ballot.chairTieBreakApplied")}</p>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
        <footer className="conduct-stage-actions" data-testid="live-item-actions">
          {meetingActions.can("agenda-item.adjourn", selectedItem.id) ? (
            <Button
              variant="secondary"
              className="conduct-adjourn-action"
              disabled={submitting}
              data-testid="live-agenda-adjourn"
              onClick={() => setAdjournConfirming(true)}
            >
              <WarningIcon aria-hidden="true" data-testid="live-agenda-adjourn-warning" />
              {t("meeting.adjournSubject")}
            </Button>
          ) : null}
          {continuation === "none" ? (
            <ConductActionBlockers
              action="continue"
              blockers={continuationBlockers ?? []}
              memberName={blockerMemberName}
            />
          ) : null}
          <div className="conduct-continuation" ref={setBallotActionContainer} data-testid="live-item-continuation">
            {matchLiteral(continuation, {
              start: () => (
                <Button
                  disabled={submitting}
                  data-testid="live-agenda-start"
                  onClick={() => void run(() => meetingActions.startAgendaItem(selectedItem.id))}
                >
                  <PlayIcon aria-hidden="true" />
                  {t(submitting ? "common.saving" : "meeting.startSubject")}
                </Button>
              ),
              vote: () =>
                !voteOpen ? (
                  <Button disabled={submitting} data-testid="live-ballot-open" onClick={() => setVoteOpen(true)}>
                    {t("live.openVote")}
                  </Button>
                ) : null,
              complete: () => (
                <Button
                  disabled={submitting}
                  data-testid="live-agenda-complete"
                  onClick={() => void completeItem("examined")}
                >
                  <CheckIcon aria-hidden="true" />
                  {t(submitting ? "common.saving" : "meeting.completeAndNext")}
                </Button>
              ),
              none: () => null,
            })}
          </div>
        </footer>
      </section>

      {adjournConfirming ? (
        <Modal
          open
          title={t("meeting.adjournSubject")}
          onClose={() => setAdjournConfirming(false)}
          testId="live-adjourn-dialog"
        >
          <div className="modal-form">
            <p>{t("live.adjournConfirmation")}</p>
            <div className="ballot-preview-actions">
              <Button
                variant="secondary"
                disabled={submitting}
                data-testid="live-adjourn-cancel"
                onClick={() => setAdjournConfirming(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={submitting}
                data-testid="live-adjourn-confirm"
                onClick={() =>
                  void run(async () => {
                    if (!(await notesAutosave.flush())) return false;
                    const adjourned = await meetingActions.adjournAgendaItem(selectedItem.id);
                    if (adjourned) setAdjournConfirming(false);
                    return adjourned;
                  })
                }
              >
                {t(submitting ? "common.saving" : "meeting.adjournSubject")}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {recusalOpen ? (
        <AgendaItemRecusalDialog
          key={selectedItem.id}
          controller={recusals}
          members={members}
          onClose={() => setRecusalOpen(false)}
        />
      ) : null}
      {closedSessionOpen && conduct ? (
        <MeetingClosedSessionDialog
          presentMembers={members.filter((member) =>
            conduct.currentAttendance.some(
              (entry) => entry.councilMemberId === member.id && entry.status === "present",
            ),
          )}
          presentOrRepresentedCount={
            conduct.currentAttendance.filter((entry) => entry.status === "present" || entry.status === "represented")
              .length
          }
          openItems={aggregate.agendaItems
            .filter((item) => item.status !== "examined" && item.status !== "adjourned")
            .map((item) => ({
              id: item.id,
              label: `${item.agendaNumber}. ${liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}`,
            }))}
          error={meetingActions.actionError}
          onRecord={meetingActions.recordClosedSession}
          onClose={() => setClosedSessionOpen(false)}
        />
      ) : null}
      {officersOpen && conduct ? (
        <MeetingOfficersDialog
          conduct={conduct}
          members={members}
          canRecordOfficerChange={meetingActions.can("meeting.record-officer-change")}
          error={meetingActions.actionError}
          onRecordOfficerChange={meetingActions.recordOfficerChange}
          onClose={() => setOfficersOpen(false)}
        />
      ) : null}
      {addItemOpen ? (
        <Modal open title={t("live.addItemTitle")} onClose={closeAddItem} testId="live-add-question-dialog">
          <div className="modal-form">
            <p className="text-sm text-muted">{t("live.addItemHint")}</p>
            <RequestErrorBanner error={meetingActions.actionError} compact />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!questionBusiness || submitting) return;
                const form = new FormData(event.currentTarget);
                void createSessionQuestion({
                  ...(questionBusiness === "new" ? {} : { councilBusinessId: questionBusiness.id }),
                  name: String(form.get("title") ?? "").trim(),
                  content: "",
                  path: "",
                });
              }}
            >
              <div className="modal-form">
                <Field label={t("meeting.subject")}>
                  <Input
                    name="title"
                    data-testid="live-add-question-name"
                    placeholder={t("meeting.subjectPlaceholder")}
                    required
                  />
                </Field>
                <ResourceSearchField
                  testId="live-add-question-business"
                  label={
                    questionBusiness && questionBusiness !== "new" ? questionBusiness.label : t("live.chooseBusiness")
                  }
                  scope={{ types: ["councilBusiness"] }}
                  disabled={submitting}
                  onPick={({ id, label }) => setQuestionBusiness({ id, label })}
                />
                <Button
                  variant="secondary"
                  type="button"
                  aria-pressed={questionBusiness === "new"}
                  data-testid="live-add-question-new-business"
                  disabled={submitting}
                  onClick={() => setQuestionBusiness("new")}
                >
                  {questionBusiness === "new" && <CheckIcon />}
                  {t("live.newBusiness")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={submitting || !questionBusiness}
                  data-testid="live-add-question-submit"
                >
                  <AddIcon />
                  {t(submitting ? "common.saving" : "common.add")}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      ) : null}
      {viewedResourceId ? (
        <ResourcePreview resourceId={viewedResourceId} onClose={() => setViewedResourceId(null)} />
      ) : null}
    </div>
  );
}
