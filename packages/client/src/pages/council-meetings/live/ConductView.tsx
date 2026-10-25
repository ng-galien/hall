import { matchLiteral } from "@hall/domain";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DisclosureBadge } from "@/components/ui/disclosure-badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createStageProgress } from "@/components/ui/stage-progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownEditor } from "../../../components/editor/MarkdownEditor";
import {
  AddIcon,
  CheckIcon,
  CloseIcon,
  CollapseIcon,
  ExpandIcon,
  FileIcon,
  GavelIcon,
  InfoIcon,
  MembersIcon,
  PlayIcon,
  WarningIcon,
} from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";

const itemStages = [
  { id: "0", icon: <FileIcon /> },
  { id: "1", icon: <MembersIcon /> },
  { id: "2", icon: <GavelIcon /> },
  { id: "3", icon: <CheckIcon /> },
] as const;
const VotingItemProgress = createStageProgress(itemStages);
const DiscussionItemProgress = createStageProgress([itemStages[0], itemStages[1], { id: "2", icon: <CheckIcon /> }]);

import { Modal, RequestErrorBanner } from "../../../components/Ui";
import { liveBusinessTitle } from "../../../features/council-business/presentation";
import { AgendaItemRecusalDialog } from "../../../features/council-meetings/AgendaItemRecusalDialog";
import { agendaSubjectPresentation } from "../../../features/council-meetings/AgendaSubjectGlyph";
import { ballotVerdictKey } from "../../../features/council-meetings/ballotVerdictPresentation";
import { ConductActionBlockers } from "../../../features/council-meetings/ConductActionBlockers";
import { recusalBasisLabel } from "../../../features/council-meetings/recusalPresentation";
import { DocumentaryResourceGlyph } from "../../../features/documents/DocumentaryResourceGlyph";
import { ResourcePreview } from "../../../features/documents/ResourcePreview";
import { useResourceImageUpload } from "../../../features/documents/useResourceImageUpload";
import { useAgendaItemRecusals } from "../../../hooks/useAgendaItemRecusals";
import type { useCouncilMeeting } from "../../../hooks/useCouncilMeeting";
import { useReferenceMentionables } from "../../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../../hooks/useSubmitting";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../../models/directory";
import type {
  LiveMeetingAgendaItem as AgendaItem,
  LiveAgendaItemStatus,
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

// @implements-requirement HALL-FR-MTG-320
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
  const [notes, setNotes] = useState("");
  const mentionables = useReferenceMentionables();
  const [voteOpen, setVoteOpen] = useState(false);
  const [viewedResourceId, setViewedResourceId] = useState<string | null>(null);
  const [closeConfirming, setCloseConfirming] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
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
  const [recusalDetailsOpen, setRecusalDetailsOpen] = useState(false);
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;
  useEffect(() => {
    if (selectedItemRef.current?.id !== selectedItemId2) return;
    setNotes(selectedItemRef.current?.discussionSummary ?? "");
    setVoteOpen(false);
    setRecusalOpen(false);
    setRecusalDetailsOpen(false);
  }, [selectedItemId2]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const savedSummary = selectedItem?.discussionSummary;
  const saveNotesRef = meetingActions.saveAgendaItemNotes;
  useEffect(() => {
    if (selectedItemId2 === null || notes === savedSummary) return;
    const timer = window.setTimeout(() => {
      void saveNotesRef(selectedItemId2, notes);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [notes, savedSummary, selectedItemId2, saveNotesRef]);

  if (!selectedItem) {
    return (
      <section className="conduct-empty">
        <p>{t("meeting.emptyAgenda")}</p>
      </section>
    );
  }

  const selectedDecisionId = agendaItemDecisionId(selectedItem);
  const meetingBlockers = meetingActions.workspace?.conduct.meetingActionBlockers;
  const blockers = meetingActions.workspace?.agendaItems.find((item) => item.id === selectedItem.id)?.conductBlockers;
  const selectedDecision = selectedDecisionId
    ? (aggregate.councilDecisions.find((decision) => decision.id === selectedDecisionId) ?? null)
    : null;
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
      if (
        notes !== selectedItem.discussionSummary &&
        !(await meetingActions.saveAgendaItemNotes(selectedItem.id, notes))
      )
        return false;
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
      if (added) setAddItemOpen(false);
      return added;
    });

  const closeMeeting = () => {
    if (!closeConfirming) {
      setCloseConfirming(true);
      return;
    }
    void run(async () => {
      if (
        notes !== selectedItem.discussionSummary &&
        !(await meetingActions.saveAgendaItemNotes(selectedItem.id, notes))
      )
        return false;
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
          <button
            className="conduct-rail-toggle"
            type="button"
            data-testid="live-agenda-toggle"
            aria-label={t(railCollapsed ? "live.railExpand" : "live.railCollapse")}
            onClick={() => setRailCollapsed((collapsed) => !collapsed)}
          >
            {railCollapsed ? <ExpandIcon /> : <CollapseIcon />}
          </button>
        </div>
        <ol className="conduct-timeline">
          {aggregate.meeting.openedAt ? (
            <li className="conduct-step conduct-step-done">
              <button
                type="button"
                className={`conduct-step-button${openingSelected ? " conduct-step-selected" : ""}`}
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
              </button>
            </li>
          ) : null}
          {orderedItems.map((item) => {
            const itemActive = Boolean(item.status === "inProgress");
            const itemDone = item.status === "examined" || item.status === "adjourned";
            const state = itemActive ? "active" : itemDone ? "done" : "upcoming";
            const itemBallot = ballotForItem(item);
            const voteRequired = Boolean(agendaItemDecisionId(item)) && !itemBallot && !itemDone;
            const stepButton = (
              <button
                className={`conduct-step-button${!openingSelected && selectedItem.id === item.id ? " conduct-step-selected" : ""}`}
                type="button"
                data-testid={`live-agenda-item-${item.id}`}
                disabled={submitting}
                aria-label={
                  railCollapsed ? liveBusinessTitle(item.business, t("agendaSubject.minutesApproval")) : undefined
                }
                aria-current={!openingSelected && selectedItem.id === item.id ? "true" : undefined}
                onClick={() =>
                  void run(async () => {
                    if (
                      selectedItem &&
                      notes !== selectedItem.discussionSummary &&
                      !(await meetingActions.saveAgendaItemNotes(selectedItem.id, notes))
                    )
                      return false;
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
                      <span className={`conduct-step-ballot conduct-step-ballot-${itemBallot.result}`}>
                        {itemBallot.result === "adopted" ? (
                          <CheckIcon aria-hidden="true" />
                        ) : (
                          <CloseIcon aria-hidden="true" />
                        )}
                        {t(ballotVerdictKey(item.subjectKind === "minutesApproval", itemBallot.result === "adopted"))}{" "}
                        {formatNumber(itemBallot.votesFor)} · {formatNumber(itemBallot.votesAgainst)} ·{" "}
                        {formatNumber(itemBallot.abstentions)}
                      </span>
                    ) : voteRequired ? (
                      <span className="conduct-step-flag">{t("live.voteRequired")}</span>
                    ) : null}
                    {itemDone && item.status !== "examined" ? (
                      <span className="conduct-step-state">{t("status.adjourned")}</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
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
          <button
            className="live-primary-action conduct-rail-tool"
            type="button"
            title={railCollapsed ? t("live.addItem") : undefined}
            data-testid="live-agenda-add"
            disabled={submitting || !meetingActions.can("meeting.add-open-question")}
            onClick={() => setAddItemOpen(true)}
          >
            <AddIcon aria-hidden="true" />
            {!railCollapsed ? t("live.addItem") : null}
          </button>
          <ConductActionBlockers
            action="add-agenda-item"
            label="live.addItem"
            blockers={meetingBlockers?.addAgendaItem ?? []}
          />
          <button
            className="live-primary-action conduct-rail-tool"
            type="button"
            title={railCollapsed ? t("live.adjustAttendance") : undefined}
            data-testid="live-attendance-adjust"
            disabled={!meetingActions.can("meeting.record-attendance-events")}
            onClick={onShowRollCall}
          >
            <MembersIcon aria-hidden="true" />
            {!railCollapsed ? t("live.adjustAttendance") : null}
          </button>
          <ConductActionBlockers
            action="attendance"
            label="live.adjustAttendance"
            blockers={meetingBlockers?.recordAttendanceEvents ?? []}
          />
          <button
            className="live-primary-action live-danger-action conduct-rail-tool"
            type="button"
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
          </button>
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
            <h1 id="conduct-opening-title">{t("live.openingStep")}</h1>
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
            </dl>
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
              <h1 id="conduct-item-title" data-testid="live-item-title">
                {liveBusinessTitle(selectedItem.business, t("agendaSubject.minutesApproval"))}
              </h1>
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
                  <Button variant="outline" className="conduct-recusal-trigger" data-testid="live-recusal-info">
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
                      <p className="text-muted-foreground">{t("recusal.separateFromVotes")}</p>
                    ) : null}
                    {recusals.canRecord ? (
                      <Button
                        variant="outline"
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
              <Link
                className="conduct-document-chip conduct-minutes-link"
                to={`/minutes/${selectedItem.business.minutesId}`}
                data-testid="live-minutes-link"
              >
                <FileIcon aria-hidden="true" />
                {t("minutes.view")}
              </Link>
            ) : null}
            {selectedItem.business.report ? (
              <details className="conduct-block" open={!voteOpen} key={`report-${selectedItem.id}-${voteOpen}`}>
                <summary data-testid="live-report-toggle">
                  <ConductBlockTitle title={t("meeting.itemReport")} />
                </summary>
                <MarkdownView className="conduct-report" markdown={selectedItem.business.report} />
              </details>
            ) : null}

            {selectedDecision ? (
              <details
                className="conduct-block conduct-draft-decision"
                open={!voteOpen}
                key={`decision-${selectedItem.id}-${voteOpen}`}
              >
                <summary data-testid="live-proposal-toggle">
                  <ConductBlockTitle title={t("meeting.draftDecision")} />
                </summary>
                <blockquote>
                  {selectedDecision.draftText ? (
                    <MarkdownView markdown={selectedDecision.draftText} />
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
                    <button
                      className="conduct-document-chip"
                      type="button"
                      key={resource.id}
                      data-testid={`live-document-${resource.id}`}
                      onClick={() => setViewedResourceId(resource.id)}
                    >
                      <DocumentaryResourceGlyph resource={resource} />
                      {resource.title}
                    </button>
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
                  onChange={setNotes}
                  onBlur={() => {
                    if (notes !== selectedItem.discussionSummary) {
                      void meetingActions.saveAgendaItemNotes(selectedItem.id, notes);
                    }
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
                actionContainer={ballotActionContainer}
                target={
                  selectedDecision ? { councilDecisionId: selectedDecision.id } : { agendaItemId: selectedItem.id }
                }
                isMinutes={selectedItem.subjectKind === "minutesApproval"}
                open={voteOpen}
                onOpenChange={setVoteOpen}
                onPreview={async (input) => {
                  if (
                    notes !== selectedItem.discussionSummary &&
                    !(await meetingActions.saveAgendaItemNotes(selectedItem.id, notes))
                  )
                    throw new Error("The discussion notes could not be saved");
                  return meetingActions.previewBallot(input);
                }}
                onConfirm={meetingActions.confirmBallot}
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
            <button
              type="button"
              className="live-primary-action live-danger-action conduct-adjourn-action"
              disabled={submitting}
              data-testid="live-agenda-adjourn"
              onClick={() => setAdjournConfirming(true)}
            >
              <WarningIcon aria-hidden="true" data-testid="live-agenda-adjourn-warning" />
              {t("meeting.adjournSubject")}
            </button>
          ) : null}
          {continuation === "none" ? (
            <ConductActionBlockers action="continue" blockers={continuationBlockers ?? []} />
          ) : null}
          <div className="conduct-continuation" ref={setBallotActionContainer} data-testid="live-item-continuation">
            {matchLiteral(continuation, {
              start: () => (
                <button
                  className="live-primary-action"
                  type="button"
                  disabled={submitting}
                  data-testid="live-agenda-start"
                  onClick={() => void run(() => meetingActions.startAgendaItem(selectedItem.id))}
                >
                  <PlayIcon aria-hidden="true" />
                  {t(submitting ? "common.saving" : "meeting.startSubject")}
                </button>
              ),
              vote: () =>
                !voteOpen ? (
                  <button
                    className="live-primary-action"
                    type="button"
                    disabled={submitting}
                    data-testid="live-ballot-open"
                    onClick={() => setVoteOpen(true)}
                  >
                    {t("live.openVote")}
                  </button>
                ) : null,
              complete: () => (
                <button
                  className="live-primary-action"
                  type="button"
                  disabled={submitting}
                  data-testid="live-agenda-complete"
                  onClick={() => void completeItem("examined")}
                >
                  <CheckIcon aria-hidden="true" />
                  {t(submitting ? "common.saving" : "meeting.completeAndNext")}
                </button>
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
                variant="outline"
                disabled={submitting}
                data-testid="live-adjourn-cancel"
                onClick={() => setAdjournConfirming(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={submitting}
                data-testid="live-adjourn-confirm"
                onClick={() =>
                  void run(async () => {
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
      {addItemOpen ? (
        <Modal
          open
          title={t("live.addItemTitle")}
          onClose={() => setAddItemOpen(false)}
          testId="live-add-question-dialog"
        >
          <div className="modal-form">
            <p className="text-sm text-muted">{t("live.addItemHint")}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void createSessionQuestion({
                  name: String(form.get("title") ?? "").trim(),
                  content: "",
                  path: "",
                });
              }}
            >
              <div className="composer-quick-add-fields">
                <Input
                  name="title"
                  data-testid="live-add-question-name"
                  placeholder={t("meeting.subjectPlaceholder")}
                  aria-label={t("meeting.subject")}
                  required
                />
                <Button variant="default" type="submit" disabled={submitting} data-testid="live-add-question-submit">
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
