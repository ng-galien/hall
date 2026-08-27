import { Button, Field, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Tooltip } from "@fluentui/react-components";
import {
  AddRegular,
  CheckmarkRegular,
  ChevronDoubleLeftRegular,
  ChevronDoubleRightRegular,
  DismissRegular,
  DocumentRegular,
  MoreHorizontalRegular,
  PeopleRegular,
  PlayRegular,
} from "@fluentui/react-icons";
import type {
  AgendaItem,
  BallotMethod,
  CouncilMember,
  DocumentMetadata,
  MeetingAggregate,
  VoteChoice,
} from "@mairie/domain";
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useState } from "react";
import { MarkdownEditor } from "../../../components/MarkdownEditor";
import { MarkdownView } from "../../../components/MarkdownView";
import { Input, Modal } from "../../../components/Ui";
import type { useCouncilMeeting } from "../../../hooks/useCouncilMeeting";
import { useSubmitting } from "../../../hooks/useSubmitting";
import { useI18n } from "../../../i18n/I18nProvider";
import { useCaseFilesStore } from "../../../stores/caseFilesStore";
import { useCouncilDecisionsStore } from "../../../stores/councilDecisionsStore";
import { useDocumentsStore } from "../../../stores/documentsStore";
import { agendaKindKeys } from "../AgendaComposer";
import { pendingBallotDecisions } from "../ballotDecisionPolicy";
import { councilMemberName } from "../ballotParticipants";
import { MeetingDocumentViewer } from "../MeetingDocumentViewer";
import type { SecretBallotTotals } from "../secretBallotTotals";
import { VotePanel } from "./VotePanel";

const RAIL_WIDTH_KEY = "mairie.live.railWidth";
const RAIL_MIN_WIDTH = 280;
const RAIL_MAX_WIDTH = 560;

function storedRailWidth(): number {
  try {
    const stored = Number(localStorage.getItem(RAIL_WIDTH_KEY));
    if (Number.isFinite(stored) && stored >= RAIL_MIN_WIDTH) return Math.min(stored, RAIL_MAX_WIDTH);
  } catch {
    /* storage unavailable */
  }
  return 380;
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
  aggregate: MeetingAggregate;
  members: CouncilMember[];
  meetingActions: ReturnType<typeof useCouncilMeeting>;
  onShowRollCall(): void;
}) {
  const { t, formatTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const { caseFiles } = useCaseFilesStore();
  const { councilDecisions } = useCouncilDecisionsStore();
  const { documents, download } = useDocumentsStore();
  const orderedItems = useMemo(
    () => [...aggregate.agendaItems].sort((left, right) => left.position - right.position),
    [aggregate.agendaItems],
  );
  const activeItem = orderedItems.find((item) => item.startedAt && !item.completedAt) ?? null;
  const nextItem = orderedItems.find((item) => !item.completedAt) ?? null;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [voteOpen, setVoteOpen] = useState(false);
  const [reviseConfirming, setReviseConfirming] = useState(false);
  const [revisionSeed, setRevisionSeed] = useState<{
    method: BallotMethod;
    assignments: Partial<Record<string, VoteChoice>>;
    secretTotals: SecretBallotTotals;
  } | null>(null);
  const [viewedDocument, setViewedDocument] = useState<DocumentMetadata | null>(null);
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
        try {
          localStorage.setItem(RAIL_WIDTH_KEY, String(width));
        } catch {
          /* storage unavailable */
        }
        return width;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const ballotForItem = (item: AgendaItem) =>
    aggregate.ballots.find(
      (ballot) =>
        !ballot.cancelledAt &&
        (ballot.agendaItemId === item.id ||
          (item.councilDecisionId && ballot.councilDecisionId === item.councilDecisionId)),
    ) ?? null;

  const selectedItem =
    orderedItems.find((item) => item.id === selectedItemId) ?? activeItem ?? nextItem ?? orderedItems.at(-1) ?? null;

  const selectedItemId2 = selectedItem?.id ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: notes reset only when another item is selected, not on background saves
  useEffect(() => {
    setNotes(selectedItem?.discussionSummary ?? "");
    setVoteOpen(false);
    setRevisionSeed(null);
    setReviseConfirming(false);
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

  const selectedDecision = selectedItem.councilDecisionId
    ? (aggregate.councilDecisions.find((decision) => decision.id === selectedItem.councilDecisionId) ?? null)
    : null;
  const selectedBallot = ballotForItem(selectedItem);
  const selectedCaseFile = selectedItem.caseFileId
    ? (caseFiles.find((caseFile) => caseFile.id === selectedItem.caseFileId) ?? null)
    : null;
  const itemDocuments = selectedItem.caseFileId
    ? documents.filter((document) => document.caseFileId === selectedItem.caseFileId)
    : [];
  const isActive = Boolean(selectedItem.startedAt && !selectedItem.completedAt);
  const isNext = !activeItem && nextItem?.id === selectedItem.id;
  const remainingCount = orderedItems.filter((item) => !item.completedAt).length;

  const completeItem = (status: "discussed" | "postponed" | "withdrawn") =>
    run(async () => {
      const completed = await meetingActions.completeAgendaItem(selectedItem.id, {
        discussionSummary: notes,
        status,
      });
      if (completed) setSelectedItemId(null);
      return completed;
    });

  const scheduledDecisionIds = new Set(
    aggregate.agendaItems.flatMap((item) => (item.councilDecisionId ? [item.councilDecisionId] : [])),
  );
  const candidateDecisions = councilDecisions.filter(
    (decision) => !scheduledDecisionIds.has(decision.id) && ["draft", "ready"].includes(decision.status),
  );
  const endPosition = Math.max(0, ...orderedItems.map((item) => item.position)) + 1;

  const addSessionItem = (input: Record<string, unknown>) =>
    run(async () => {
      const added = await meetingActions.addAgendaItem(input);
      if (added) setAddItemOpen(false);
      return added;
    });

  const reviseBallot = () => {
    if (!selectedBallot) return;
    if (!reviseConfirming) {
      setReviseConfirming(true);
      return;
    }
    const seed = {
      method: selectedBallot.method,
      assignments:
        selectedBallot.method === "public"
          ? Object.fromEntries(selectedBallot.votes.map((vote) => [vote.memberId, vote.choice]))
          : {},
      secretTotals: {
        votesFor: selectedBallot.votesFor,
        votesAgainst: selectedBallot.votesAgainst,
        abstentions: selectedBallot.abstentions,
        notVoting: selectedBallot.notVoting,
      },
    };
    void run(async () => {
      const cancelled = await meetingActions.cancelBallot(selectedBallot.id);
      if (cancelled) {
        setRevisionSeed(seed);
        setVoteOpen(true);
      }
      setReviseConfirming(false);
      return cancelled;
    });
  };

  const closeMeeting = () => {
    if (!closeConfirming) {
      setCloseConfirming(true);
      return;
    }
    void run(() => meetingActions.changeStatus("closed"));
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
            aria-label={t(railCollapsed ? "live.railExpand" : "live.railCollapse")}
            onClick={() => setRailCollapsed((collapsed) => !collapsed)}
          >
            {railCollapsed ? <ChevronDoubleRightRegular /> : <ChevronDoubleLeftRegular />}
          </button>
        </div>
        <ol className="conduct-timeline">
          {orderedItems.map((item, index) => {
            const itemActive = Boolean(item.startedAt && !item.completedAt);
            const itemDone = Boolean(item.completedAt);
            const state = itemActive ? "active" : itemDone ? "done" : "upcoming";
            const itemBallot = ballotForItem(item);
            const voteRequired = Boolean(item.councilDecisionId) && !itemBallot && !itemDone;
            const stepButton = (
              <button
                className={`conduct-step-button${selectedItem.id === item.id ? " conduct-step-selected" : ""}`}
                type="button"
                aria-current={selectedItem.id === item.id ? "true" : undefined}
                onClick={() => setSelectedItemId(item.id)}
              >
                <span className="conduct-step-marker" aria-hidden="true">
                  {itemDone ? <CheckmarkRegular /> : itemActive ? <PlayRegular /> : index + 1}
                </span>
                {!railCollapsed ? (
                  <span className="conduct-step-copy">
                    <strong>{item.title}</strong>
                    <span>
                      {item.startedAt ? formatTime(item.startedAt) : t("meeting.subjectUpcoming")}
                      {item.completedAt ? ` → ${formatTime(item.completedAt)}` : ""}
                    </span>
                    {itemBallot ? (
                      <span className={`conduct-step-ballot conduct-step-ballot-${itemBallot.result}`}>
                        {itemBallot.result === "adopted" ? (
                          <CheckmarkRegular aria-hidden="true" />
                        ) : (
                          <DismissRegular aria-hidden="true" />
                        )}
                        {t(itemBallot.result === "adopted" ? "live.adopted" : "live.rejected")}{" "}
                        {formatNumber(itemBallot.votesFor)} · {formatNumber(itemBallot.votesAgainst)} ·{" "}
                        {formatNumber(itemBallot.abstentions)}
                      </span>
                    ) : voteRequired ? (
                      <span className="conduct-step-flag">{t("live.voteRequired")}</span>
                    ) : null}
                    {itemDone && item.status !== "discussed" ? (
                      <span className="conduct-step-state">
                        {t(item.status === "postponed" ? "status.postponed" : "status.withdrawn")}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
            return (
              <li className={`conduct-step conduct-step-${state}`} key={item.id}>
                {railCollapsed ? (
                  <Tooltip
                    content={{
                      className: "step-tooltip",
                      children: (
                        <span className="step-tooltip-body">
                          <strong>{item.title}</strong>
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
                          {itemDone && item.status !== "discussed" ? (
                            <span>{t(item.status === "postponed" ? "status.postponed" : "status.withdrawn")}</span>
                          ) : null}
                        </span>
                      ),
                    }}
                    relationship="description"
                    positioning="after"
                    appearance="inverted"
                    withArrow
                  >
                    {stepButton}
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
            onClick={() => setAddItemOpen(true)}
          >
            <AddRegular aria-hidden="true" />
            {!railCollapsed ? t("live.addItem") : null}
          </button>
          <button
            className="conduct-rail-tool"
            type="button"
            title={railCollapsed ? t("live.adjustAttendance") : undefined}
            onClick={onShowRollCall}
          >
            <PeopleRegular aria-hidden="true" />
            {!railCollapsed ? t("live.adjustAttendance") : null}
          </button>
          <button
            className={`conduct-rail-tool conduct-rail-close${closeConfirming ? " conduct-rail-close-confirm" : ""}`}
            type="button"
            disabled={submitting}
            title={railCollapsed ? t("meeting.action.close") : undefined}
            onClick={closeMeeting}
            onBlur={() => setCloseConfirming(false)}
          >
            {railCollapsed ? (
              <DismissRegular aria-hidden="true" />
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
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only resize handle; keyboard users use the collapse toggle
          <div className="conduct-rail-resizer" aria-hidden="true" onPointerDown={startRailResize} />
        ) : null}
      </aside>

      <section className="conduct-stage" aria-labelledby="conduct-item-title">
        <header className="conduct-stage-header">
          <span className="live-eyebrow">
            {t("live.itemEyebrow").replace("{position}", formatNumber(selectedItem.position))} ·{" "}
            {t(agendaKindKeys[selectedItem.kind])}
            {selectedCaseFile ? ` · ${selectedCaseFile.reference}` : ""}
          </span>
          <h1 id="conduct-item-title">{selectedItem.title}</h1>
          {isActive && selectedItem.startedAt ? (
            <div className="conduct-timer" role="timer">
              <span className="live-indicator" aria-hidden="true" />
              {elapsedSince(selectedItem.startedAt, now)}
            </div>
          ) : null}
        </header>

        <div className="conduct-stage-body">
          {selectedItem.report ? (
            <details className="conduct-block" open={!voteOpen} key={`report-${selectedItem.id}-${voteOpen}`}>
              <summary>{t("meeting.itemReport")}</summary>
              <MarkdownView className="conduct-report" markdown={selectedItem.report} />
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

          {itemDocuments.length > 0 ? (
            <details className="conduct-block" open={!voteOpen} key={`documents-${selectedItem.id}-${voteOpen}`}>
              <summary>{t("meeting.supportingDocuments")}</summary>
              <div className="conduct-documents">
                {itemDocuments.map((document) => (
                  <button
                    className="conduct-document-chip"
                    type="button"
                    key={document.id}
                    onClick={() => setViewedDocument(document)}
                  >
                    <DocumentRegular aria-hidden="true" />
                    {document.fileName}
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
            <details className="conduct-block" open={!voteOpen} key={`notes-${selectedItem.id}-${voteOpen}`}>
              <summary>{t("meeting.observations")}</summary>
              <MarkdownEditor
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
          !selectedBallot &&
          (selectedDecision
            ? pendingBallotDecisions(aggregate).some((decision) => decision.id === selectedDecision.id)
            : true) ? (
            <VotePanel
              key={revisionSeed ? `revision-${selectedItem.id}` : `fresh-${selectedItem.id}`}
              aggregate={aggregate}
              members={members}
              target={selectedDecision ? { councilDecisionId: selectedDecision.id } : { agendaItemId: selectedItem.id }}
              open={voteOpen}
              onOpenChange={setVoteOpen}
              onRecord={meetingActions.recordBallot}
              initialMethod={revisionSeed?.method}
              initialAssignments={revisionSeed?.assignments}
              initialSecretTotals={revisionSeed?.secretTotals}
            />
          ) : null}

          {selectedBallot ? (
            <section
              className={`conduct-result conduct-result-${selectedBallot.result}`}
              aria-label={t("ballot.results")}
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
                {isActive ? (
                  <button
                    className={`conduct-result-revise${reviseConfirming ? " conduct-result-revise-confirm" : ""}`}
                    type="button"
                    disabled={submitting}
                    onClick={reviseBallot}
                    onBlur={() => setReviseConfirming(false)}
                  >
                    {t(reviseConfirming ? "live.reviseVoteConfirm" : "live.reviseVote")}
                  </button>
                ) : null}
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
                  .replace("{required}", formatNumber(selectedBallot.participationEvidence.quorum.required))
                  .replace("{roster}", formatNumber(selectedBallot.participationEvidence.quorum.activeMembers))}
              </p>
              {selectedBallot.chairTieBreakApplied ? (
                <p className="report-ballot-note">{t("ballot.chairTieBreakApplied")}</p>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="conduct-stage-actions">
          {isNext ? (
            <button
              className="live-primary-action"
              type="button"
              disabled={submitting}
              onClick={() => void run(() => meetingActions.startAgendaItem(selectedItem.id))}
            >
              <PlayRegular aria-hidden="true" />
              {t(submitting ? "common.saving" : "meeting.startSubject")}
            </button>
          ) : null}
          {isActive ? (
            <>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t("live.moreActions")} />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem onClick={() => void completeItem("postponed")}>{t("meeting.postponeSubject")}</MenuItem>
                    <MenuItem onClick={() => void completeItem("withdrawn")}>{t("meeting.withdrawSubject")}</MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
              <button
                className="live-primary-action"
                type="button"
                disabled={submitting || (Boolean(selectedItem.councilDecisionId) && !selectedBallot)}
                onClick={() => void completeItem("discussed")}
              >
                <CheckmarkRegular aria-hidden="true" />
                {t(submitting ? "common.saving" : "meeting.completeAndNext")}
              </button>
            </>
          ) : null}
        </footer>
      </section>

      {addItemOpen ? (
        <Modal open title={t("live.addItemTitle")} onClose={() => setAddItemOpen(false)}>
          <div className="modal-form">
            <p className="text-sm text-muted">{t("live.addItemHint")}</p>
            {candidateDecisions.length > 0 ? (
              <section aria-labelledby="session-add-decisions">
                <h3 className="picker-heading" id="session-add-decisions">
                  {t("meeting.addDecisionHeading")}
                </h3>
                <ul className="composer-decision-list">
                  {candidateDecisions.map((decision) => (
                    <li key={decision.id}>
                      <span className="composer-item-copy">
                        <strong>{decision.title}</strong>
                        <span>
                          {caseFiles.find((caseFile) => caseFile.id === decision.caseFileId)?.reference ??
                            t("decisions.draft")}
                        </span>
                      </span>
                      <Button
                        appearance="secondary"
                        size="small"
                        icon={<AddRegular />}
                        disabled={submitting}
                        onClick={() =>
                          void addSessionItem({
                            position: endPosition,
                            kind: "councilDecision",
                            title: decision.title,
                            report: "",
                            councilDecisionId: decision.id,
                            caseFileId: decision.caseFileId,
                          })
                        }
                      >
                        {t("meeting.addToAgenda")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void addSessionItem({
                  position: endPosition,
                  kind: form.get("kind"),
                  title: form.get("title"),
                  report: "",
                  councilDecisionId: null,
                  caseFileId: null,
                });
              }}
            >
              <h3 className="picker-heading">{t("meeting.addOtherHeading")}</h3>
              <div className="composer-quick-add-fields">
                <select name="kind" aria-label={t("meeting.type")} defaultValue="question">
                  <option value="question">{t("agendaKind.question")}</option>
                  <option value="information">{t("agendaKind.information")}</option>
                  <option value="election">{t("agendaKind.election")}</option>
                  <option value="other">{t("agendaKind.other")}</option>
                </select>
                <Input
                  name="title"
                  placeholder={t("meeting.subjectPlaceholder")}
                  aria-label={t("meeting.subject")}
                  required
                />
                <Button appearance="primary" type="submit" icon={<AddRegular />} disabled={submitting}>
                  {t(submitting ? "common.saving" : "common.add")}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      ) : null}
      <MeetingDocumentViewer
        document={viewedDocument}
        onClose={() => setViewedDocument(null)}
        onDownload={(document) => void download(document)}
      />
    </div>
  );
}
