import { matchLiteral } from "@hall/domain";
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownEditor } from "../../../components/editor/MarkdownEditor";
import {
  AddIcon,
  CheckIcon,
  CloseIcon,
  CollapseIcon,
  ExpandIcon,
  FileIcon,
  MembersIcon,
  MoreIcon,
  PlayIcon,
} from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { Modal, RequestErrorBanner } from "../../../components/Ui";
import { useAgendaItemRecusals } from "../../../hooks/useAgendaItemRecusals";
import { AgendaItemRecusalDialog } from "../../../features/council-meetings/AgendaItemRecusalDialog";
import { recusalBasisLabel } from "../../../features/council-meetings/recusalPresentation";
import { councilBusinessKindKeys, liveBusinessTitle } from "../../../features/council-business/presentation";
import { ResourcePreview } from "../../../features/documents/ResourcePreview";
import { useResourceImageUpload } from "../../../features/documents/useResourceImageUpload";
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
import { VotePanel } from "./VotePanel";

const RAIL_WIDTH_KEY = "mairie.live.railWidth";
const RAIL_MIN_WIDTH = 280;
const RAIL_MAX_WIDTH = 560;

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
  const orderedItems = useMemo(
    () => [...aggregate.agendaItems].sort((left, right) => left.position - right.position),
    [aggregate.agendaItems],
  );
  const activeItem = orderedItems.find((item) => item.status === "inProgress") ?? null;
  const nextItem = orderedItems.find((item) => item.status === "scheduled" || item.status === "inProgress") ?? null;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [openingSelected, setOpeningSelected] = useState(false);
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

  const selectedItem =
    orderedItems.find((item) => item.id === selectedItemId) ?? activeItem ?? nextItem ?? orderedItems.at(-1) ?? null;

  const selectedItemId2 = selectedItem?.id ?? null;
  const recusals = useAgendaItemRecusals(
    aggregate.meeting.id,
    selectedItemId2,
    `${selectedItem?.status}:${aggregate.ballots.length}:${JSON.stringify(aggregate.attendance)}`,
  );
  const [recusalOpen, setRecusalOpen] = useState(false);
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;
  useEffect(() => {
    if (selectedItemRef.current?.id !== selectedItemId2) return;
    setNotes(selectedItemRef.current?.discussionSummary ?? "");
    setVoteOpen(false);
    setRecusalOpen(false);
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
  });
  const isActive = selectedItem.status === "inProgress";
  const isNext = !activeItem && nextItem?.id === selectedItem.id;
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

  const endPosition = Math.max(0, ...orderedItems.map((item) => item.position)) + 1;

  const createSessionBusiness = (input: Parameters<typeof meetingActions.createAndScheduleBusiness>[0]) =>
    run(async () => {
      const added = await meetingActions.createAndScheduleBusiness(input, endPosition);
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
      return meetingActions.changeStatus("closed");
    });
  };

  return (
    <div className="conduct">
      <aside
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
          {orderedItems.map((item, index) => {
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
                  {itemDone ? <CheckIcon /> : itemActive ? <PlayIcon /> : index + 1}
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
                        {t(itemBallot.result === "adopted" ? "live.adopted" : "live.rejected")}{" "}
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
                            {t(itemBallot.result === "adopted" ? "live.adopted" : "live.rejected")}{" "}
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
            className="conduct-rail-tool"
            type="button"
            title={railCollapsed ? t("live.addItem") : undefined}
            disabled={!meetingActions.can("meeting.add-late-business")}
            onClick={() => setAddItemOpen(true)}
          >
            <AddIcon aria-hidden="true" />
            {!railCollapsed ? t("live.addItem") : null}
          </button>
          <button
            className="conduct-rail-tool"
            type="button"
            title={railCollapsed ? t("live.adjustAttendance") : undefined}
            disabled={!meetingActions.can("meeting.record-attendance")}
            onClick={onShowRollCall}
          >
            <MembersIcon aria-hidden="true" />
            {!railCollapsed ? t("live.adjustAttendance") : null}
          </button>
          <button
            className={`conduct-rail-tool conduct-rail-close${closeConfirming ? " conduct-rail-close-confirm" : ""}`}
            type="button"
            disabled={submitting || !meetingActions.can("meeting.close")}
            data-testid="live-meeting-close"
            title={railCollapsed ? t("meeting.action.close") : undefined}
            onClick={closeMeeting}
            onBlur={() => setCloseConfirming(false)}
          >
            {railCollapsed ? (
              <CloseIcon aria-hidden="true" />
            ) : closeConfirming ? (
              remainingCount > 0 ? (
                t("live.confirmCloseRemaining").replace("{count}", formatNumber(remainingCount))
              ) : (
                t("live.confirmClose")
              )
            ) : (
              t("meeting.action.close")
            )}
          </button>
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
              {t("meeting.quorumFailureEvidence")
                .replace("{present}", formatNumber(aggregate.quorum.physicallyPresent))
                .replace(
                  "{required}",
                  aggregate.quorum.required === null
                    ? t("meeting.quorumUnestablished")
                    : formatNumber(aggregate.quorum.required),
                )}
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
      <section className="conduct-stage" hidden={openingSelected} aria-labelledby="conduct-item-title">
        <header className="conduct-stage-header">
          <span className="live-eyebrow">
            {t("live.itemEyebrow").replace("{position}", formatNumber(selectedItem.position))} ·{" "}
            {t(councilBusinessKindKeys[selectedItem.business.kind])}
            {selectedItem.business.folderPath ? ` · ${selectedItem.business.folderPath}` : ""}
          </span>
          <h1 id="conduct-item-title">
            {liveBusinessTitle(selectedItem.business, t("agendaSubject.minutesApproval"))}
          </h1>
          <ol className="conduct-item-progress" aria-label={t("live.progressLabel")} data-testid="live-item-progress">
            {progressLabels.map((label, index) => (
              <li
                key={label}
                aria-current={index === progressIndex ? "step" : undefined}
                data-completed={
                  (index < progressIndex && (index !== 2 || !hasVotingStage || Boolean(selectedBallot))) || undefined
                }
              >
                {label}
              </li>
            ))}
          </ol>
          {isActive && selectedItem.startedAt ? (
            <div className="conduct-timer" role="timer">
              <span className="live-indicator" aria-hidden="true" />
              {elapsedSince(selectedItem.startedAt, now)}
            </div>
          ) : null}
        </header>

        <div className="conduct-stage-body">
          <RequestErrorBanner error={recusals.error} />
          {recusals.state && (recusals.canRecord || recusals.state.recusals.length > 0) ? (
            <section className="grid gap-2" data-testid="agenda-item-recusals">
              <div className="flex items-center justify-between gap-2">
                <strong>{t("recusal.listTitle")}</strong>
                {recusals.canRecord ? (
                  <Button variant="outline" data-testid="agenda-item-recusal-open" onClick={() => setRecusalOpen(true)}>
                    {t("recusal.title")}
                  </Button>
                ) : null}
              </div>
              {recusals.state.recusals.map((entry) => (
                <p key={entry.id} data-testid={`agenda-item-recusal-${entry.councilMemberId}`}>
                  <strong>{entry.memberName}</strong> · {t(recusalBasisLabel(entry.legalBasis))}
                </p>
              ))}
              {recusals.state.recusals.length > 0 ? (
                <p className="text-sm text-muted-foreground">{t("recusal.separateFromVotes")}</p>
              ) : null}
            </section>
          ) : null}
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
              <summary>{t("meeting.itemReport")}</summary>
              <MarkdownView className="conduct-report" markdown={selectedItem.business.report} />
            </details>
          ) : null}

          {selectedDecision ? (
            <details
              className="conduct-block conduct-draft-decision"
              open={!voteOpen}
              key={`decision-${selectedItem.id}-${voteOpen}`}
            >
              <summary>{t("meeting.draftDecision")}</summary>
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
              <summary>{t("meeting.supportingDocuments")}</summary>
              <div className="conduct-documents">
                {itemResources.map((resource) => (
                  <button
                    className="conduct-document-chip"
                    type="button"
                    key={resource.id}
                    onClick={() => setViewedResourceId(resource.id)}
                  >
                    <FileIcon aria-hidden="true" />
                    {resource.title}
                  </button>
                ))}
              </div>
            </details>
          ) : null}

          {selectedItem.completedAt && selectedItem.discussionSummary ? (
            <details className="conduct-block" open key={`summary-${selectedItem.id}`}>
              <summary>{t("meeting.observations")}</summary>
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
              <summary>{t("meeting.observations")}</summary>
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

          {isActive &&
          recusals.state &&
          !selectedBallot &&
          meetingActions.can("ballot.record", selectedItem.id) &&
          (selectedDecision
            ? pendingBallotDecisions(aggregate).some((decision) => decision.id === selectedDecision.id)
            : true) ? (
            <VotePanel
              key={selectedItem.id}
              aggregate={aggregate}
              members={members}
              eligibleAttendanceIds={recusals.state.eligibleParticipantAttendanceIds}
              departedAttendanceIds={recusals.state.departedParticipantAttendanceIds}
              onDeclareRecusal={recusals.canRecord ? () => setRecusalOpen(true) : undefined}
              target={selectedDecision ? { councilDecisionId: selectedDecision.id } : { agendaItemId: selectedItem.id }}
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
                    {t(selectedBallot.result === "adopted" ? "live.adopted" : "live.rejected")}
                  </span>
                  <div>
                    <span className="conduct-result-meta">
                      {t(selectedBallot.method === "public" ? "ballot.method.public" : "ballot.method.secret")} ·{" "}
                      {t("live.recordedAt").replace("{time}", formatTime(selectedBallot.createdAt))}
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
                                  {t("live.proxyVoteSuffix").replace(
                                    "{holder}",
                                    councilMemberName(members, vote.castByMemberId),
                                  )}
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
                {t("ballot.expressedMajority").replace("{expressed}", formatNumber(selectedBallot.votesCast))}
              </p>
              <p className="report-ballot-note">
                {t("ballot.participationEvidence")
                  .replace("{present}", formatNumber(selectedBallot.participationEvidence.quorum.physicallyPresent))
                  .replace(
                    "{required}",
                    selectedBallot.participationEvidence.quorum.required === null
                      ? t("meeting.quorumUnestablished")
                      : formatNumber(selectedBallot.participationEvidence.quorum.required),
                  )
                  .replace("{roster}", formatNumber(selectedBallot.participationEvidence.quorum.activeMembers))}
              </p>
              {selectedBallot.chairTieBreakApplied ? (
                <p className="report-ballot-note">{t("ballot.chairTieBreakApplied")}</p>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="conduct-stage-actions">
          {isNext && meetingActions.can("agenda-item.start", selectedItem.id) ? (
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
          ) : null}
          {meetingActions.can("agenda-item.adjourn", selectedItem.id) ||
          recusals.canRecord ||
          (isActive && meetingActions.can("agenda-item.complete", selectedItem.id)) ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    data-testid="live-agenda-actions"
                    size="icon"
                    variant="ghost"
                    aria-label={t("live.moreActions")}
                  >
                    <MoreIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {recusals.canRecord ? (
                    <DropdownMenuItem data-testid="live-agenda-recusal" onSelect={() => setRecusalOpen(true)}>
                      {t("recusal.title")}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    data-testid="live-agenda-adjourn"
                    disabled={submitting || !meetingActions.can("agenda-item.adjourn", selectedItem.id)}
                    onSelect={() => void run(() => meetingActions.adjournAgendaItem(selectedItem.id))}
                  >
                    {t("meeting.adjournSubject")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                className="live-primary-action"
                type="button"
                disabled={submitting || !meetingActions.can("agenda-item.complete", selectedItem.id)}
                onClick={() => void completeItem("examined")}
              >
                <CheckIcon aria-hidden="true" />
                {t(submitting ? "common.saving" : "meeting.completeAndNext")}
              </button>
            </>
          ) : null}
        </footer>
      </section>

      {recusalOpen ? (
        <AgendaItemRecusalDialog
          key={selectedItem.id}
          controller={recusals}
          members={members}
          onClose={() => setRecusalOpen(false)}
        />
      ) : null}
      {addItemOpen ? (
        <Modal open title={t("live.addItemTitle")} onClose={() => setAddItemOpen(false)}>
          <div className="modal-form">
            <p className="text-sm text-muted">{t("live.addItemHint")}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void createSessionBusiness({
                  kind: form.get("kind") === "matter" ? "matter" : "openQuestion",
                  title: String(form.get("title") ?? ""),
                  report: "",
                  folderPath: "",
                });
              }}
            >
              <h3 className="picker-heading">{t("meeting.addOtherHeading")}</h3>
              <div className="composer-quick-add-fields">
                <Select name="kind" defaultValue="openQuestion">
                  <SelectTrigger aria-label={t("meeting.type")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openQuestion">{t("councilBusinessKind.openQuestion")}</SelectItem>
                    <SelectItem value="matter">{t("councilBusinessKind.matter")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  name="title"
                  placeholder={t("meeting.subjectPlaceholder")}
                  aria-label={t("meeting.subject")}
                  required
                />
                <Button variant="default" type="submit" disabled={submitting}>
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
