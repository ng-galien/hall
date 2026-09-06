import type {
  LiveBallotMethod as BallotMethod,
  LiveBallotSubmission as RecordBallotInput,
  LiveMeetingPresentation,
  LiveVoteChoice as VoteChoice,
} from "../../../models/liveMeeting";
import type { CouncilMemberView } from "../../../models/directory";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { useSubmitting } from "../../../hooks/useSubmitting";
import type { TranslationKey } from "../../../i18n/en";
import { useI18n } from "../../../i18n/I18nProvider";
import { type BallotParticipant, ballotParticipants } from "../ballotParticipants";
import { initialSecretBallotTotals, reconcileSecretBallotTotals, type SecretBallotTotals } from "../secretBallotTotals";

type ZoneChoice = VoteChoice | "unassigned";

const targetZones: { choice: VoteChoice; labelKey: TranslationKey }[] = [
  { choice: "for", labelKey: "ballot.choice.for" },
  { choice: "against", labelKey: "ballot.choice.against" },
  { choice: "abstain", labelKey: "ballot.choice.abstain" },
  { choice: "notVoting", labelKey: "ballot.choice.notVoting" },
];

const secretCounters: { key: keyof SecretBallotTotals; labelKey: TranslationKey }[] = [
  { key: "votesFor", labelKey: "ballot.votesFor" },
  { key: "votesAgainst", labelKey: "ballot.votesAgainst" },
  { key: "abstentions", labelKey: "ballot.abstentions" },
];

function VoteBadge({
  participant,
  zone,
  member,
  carriedCount,
  dragging,
  selected,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  participant: BallotParticipant;
  zone: ZoneChoice;
  member: CouncilMemberView | undefined;
  carriedCount: number;
  dragging: boolean;
  selected: boolean;
  onDragStart(): void;
  onDragEnd(): void;
  onClick(): void;
}) {
  const { t, formatNumber } = useI18n();
  const proxyVote = participant.memberId !== participant.castByMemberId;
  return (
    <button
      className={`vote-card vote-card-${zone}${proxyVote ? " vote-card-carried" : ""}${dragging ? " vote-card-dragging" : ""}${selected ? " vote-card-selected" : ""}`}
      aria-pressed={selected}
      type="button"
      data-testid={`live-vote-member-${participant.memberId}`}
      draggable
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <span className="vote-card-avatar" aria-hidden="true">
        {participant.memberName
          .split(" ")
          .map((part) => part.slice(0, 1))
          .slice(0, 2)
          .join("")}
      </span>
      <span className="vote-card-copy">
        <strong>{participant.memberName}</strong>
        <span>
          {proxyVote
            ? t("live.carriedBy").replace("{holder}", participant.castByName)
            : member
              ? t(`role.${member.role}`)
              : ""}
        </span>
      </span>
      {!proxyVote && carriedCount > 0 ? (
        <span
          className="vote-card-proxy-count"
          title={t("live.holdsProxies").replace("{count}", formatNumber(carriedCount))}
        >
          +{formatNumber(carriedCount)}
        </span>
      ) : null}
    </button>
  );
}

export function VotePanel({
  aggregate,
  members,
  target,
  open,
  onOpenChange,
  onRecord,
  initialMethod,
  initialAssignments,
  initialSecretTotals,
  eligibleAttendanceIds,
  onDeclareRecusal,
}: {
  aggregate: LiveMeetingPresentation;
  members: CouncilMemberView[];
  target: { councilDecisionId: string } | { agendaItemId: string };
  open: boolean;
  onOpenChange(open: boolean): void;
  onRecord(input: RecordBallotInput): Promise<boolean>;
  initialMethod?: BallotMethod;
  initialAssignments?: Partial<Record<string, VoteChoice>>;
  initialSecretTotals?: SecretBallotTotals;
  eligibleAttendanceIds: readonly string[];
  onDeclareRecusal?: () => void;
}) {
  const { t, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const [method, setMethod] = useState<BallotMethod>(initialMethod ?? "public");
  const [assignments, setAssignments] = useState<Partial<Record<string, VoteChoice>>>(initialAssignments ?? {});
  const [selectedMemberIds, setSelectedMemberIds] = useState<ReadonlySet<string>>(new Set());
  const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<ZoneChoice | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const participants = ballotParticipants(
    { ...aggregate, attendance: aggregate.attendance.filter((entry) => eligibleAttendanceIds.includes(entry.id)) },
    members,
  );
  const [secretExcludedIds, setSecretExcludedIds] = useState<ReadonlySet<string>>(new Set());
  const secretParticipants = participants.filter((participant) => !secretExcludedIds.has(participant.memberId));
  const previousParticipantCount = useRef(participants.length);
  const [secretTotals, setSecretTotals] = useState(
    () => initialSecretTotals ?? initialSecretBallotTotals(participants.length),
  );

  useEffect(() => {
    const previousCount = previousParticipantCount.current;
    if (previousCount === participants.length) return;
    setSecretTotals((totals) => reconcileSecretBallotTotals(totals, previousCount, participants.length));
    previousParticipantCount.current = participants.length;
  }, [participants.length]);

  const memberById = new Map(members.map((member) => [member.id, member]));
  const carriedCountByHolder = participants.reduce<Map<string, number>>((accumulator, participant) => {
    if (participant.memberId !== participant.castByMemberId) {
      accumulator.set(participant.castByMemberId, (accumulator.get(participant.castByMemberId) ?? 0) + 1);
    }
    return accumulator;
  }, new Map());

  const zoneOf = (memberId: string): ZoneChoice => assignments[memberId] ?? "unassigned";
  const participantsIn = (zone: ZoneChoice) =>
    participants.filter((participant) => zoneOf(participant.memberId) === zone);
  const unassigned = participantsIn("unassigned");
  const counts = {
    for: participantsIn("for").length,
    against: participantsIn("against").length,
    abstain: participantsIn("abstain").length,
    notVoting: participantsIn("notVoting").length,
  };

  const assignMembers = (memberIds: Iterable<string>, zone: ZoneChoice) => {
    setAssignments((current) => {
      const next = { ...current };
      for (const memberId of memberIds) {
        if (zone === "unassigned") delete next[memberId];
        else next[memberId] = zone;
      }
      return next;
    });
    setSelectedMemberIds(new Set());
  };
  const toggleSelection = (memberId: string) => {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };
  const dropIntoZone = (zone: ZoneChoice, draggedId?: string | null) => {
    const movedIds =
      draggedId && !selectedMemberIds.has(draggedId)
        ? [draggedId]
        : [...selectedMemberIds, ...(draggedId ? [draggedId] : [])];
    if (movedIds.length > 0) assignMembers(new Set(movedIds), zone);
  };
  const assignRemainingFor = () => {
    assignMembers(
      unassigned.map((participant) => participant.memberId),
      "for",
    );
  };

  const adjustSecretTotal = (key: keyof SecretBallotTotals, offset: number) => {
    setSecretTotals((totals) => ({ ...totals, [key]: Math.max(0, totals[key] + offset) }));
  };
  const secretTotalCount = secretTotals.votesFor + secretTotals.votesAgainst + secretTotals.abstentions;
  const secretValid = secretTotalCount === secretParticipants.length && secretParticipants.length > 0;
  const publicComplete = unassigned.length === 0 && participants.length > 0;

  const record = () =>
    run(async () => {
      const input: RecordBallotInput =
        method === "public"
          ? {
              method,
              idempotencyKey: idempotencyKey.current,
              ...target,
              votes: participants.map((participant) => ({
                memberId: participant.memberId,
                castByMemberId: participant.castByMemberId,
                choice: assignments[participant.memberId] ?? "notVoting",
              })),
            }
          : {
              method,
              idempotencyKey: idempotencyKey.current,
              ...target,
              participantMemberIds: secretParticipants.map((participant) => participant.memberId),
              totals: { ...secretTotals, notVoting: participants.length - secretParticipants.length },
            };
      const recorded = await onRecord(input);
      if (recorded) {
        idempotencyKey.current = crypto.randomUUID();
        setAssignments({});
        setSecretTotals(initialSecretBallotTotals(participants.length));
        onOpenChange(false);
      }
      return recorded;
    });

  const zoneDropHandlers = (zone: ZoneChoice) => ({
    onDragOver: (event: DragEvent) => {
      if (!draggedMemberId) return;
      event.preventDefault();
      setDropZone(zone);
    },
    onDragLeave: () => setDropZone((current) => (current === zone ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (draggedMemberId) dropIntoZone(zone, draggedMemberId);
      setDraggedMemberId(null);
      setDropZone(null);
    },
  });

  const renderBadge = (participant: BallotParticipant, zone: ZoneChoice) => (
    <VoteBadge
      participant={participant}
      zone={zone}
      member={memberById.get(participant.memberId)}
      carriedCount={carriedCountByHolder.get(participant.memberId) ?? 0}
      dragging={draggedMemberId === participant.memberId}
      selected={selectedMemberIds.has(participant.memberId)}
      onDragStart={() => setDraggedMemberId(participant.memberId)}
      onDragEnd={() => {
        setDraggedMemberId(null);
        setDropZone(null);
      }}
      onClick={() => toggleSelection(participant.memberId)}
      key={participant.memberId}
    />
  );

  if (!open) {
    return (
      <section className="vote-panel vote-panel-collapsed">
        <button
          className="live-primary-action vote-open-action"
          type="button"
          data-testid="live-ballot-open"
          onClick={() => onOpenChange(true)}
        >
          {t("live.openVote")}
        </button>
        <p className="vote-eligible-hint">
          {t("ballot.eligibleCount").replace("{count}", formatNumber(participants.length))}
        </p>
      </section>
    );
  }

  return (
    <section className="vote-panel" aria-labelledby="vote-panel-heading">
      <header className="vote-panel-header">
        <h2 id="vote-panel-heading">{t("ballot.itemTitle")}</h2>
        {onDeclareRecusal ? (
          <button className="vote-reset" type="button" data-testid="live-ballot-recusal" onClick={onDeclareRecusal}>
            {t("recusal.title")}
          </button>
        ) : null}
        <div className="vote-method-toggle">
          <button
            className={`vote-method-choice${method === "public" ? " vote-method-choice-active" : ""}`}
            type="button"
            aria-pressed={method === "public"}
            data-testid="live-ballot-mode-public"
            onClick={() => setMethod("public")}
          >
            {t("ballot.method.public")}
          </button>
          <button
            className={`vote-method-choice${method === "secret" ? " vote-method-choice-active" : ""}`}
            type="button"
            aria-pressed={method === "secret"}
            data-testid="live-ballot-mode-secret"
            onClick={() => setMethod("secret")}
          >
            {t("ballot.method.secret")}
          </button>
        </div>
      </header>
      <p className="vote-panel-hint">{t(method === "public" ? "live.publicVoteHint" : "ballot.secretDescription")}</p>

      {method === "public" ? (
        <>
          <section
            className={`vote-source-zone${dropZone === "unassigned" ? " vote-zone-over" : ""}`}
            aria-label={t("live.unassignedZone")}
            {...zoneDropHandlers("unassigned")}
          >
            <header className="vote-zone-header">
              <span>{t("live.unassignedZone")}</span>
              <span className="vote-source-tools">
                <strong>{formatNumber(unassigned.length)}</strong>
                {unassigned.length > 0 ? (
                  <button
                    className="vote-reset"
                    type="button"
                    data-testid="live-ballot-all-for"
                    onClick={assignRemainingFor}
                  >
                    {t("live.remainingToFor")}
                  </button>
                ) : null}
              </span>
            </header>
            <div className="vote-zone-chips">
              {unassigned.length > 0 ? (
                unassigned.map((participant) => renderBadge(participant, "unassigned"))
              ) : (
                <p className="vote-source-empty">{t("live.allAssigned")}</p>
              )}
            </div>
          </section>
          <div className="vote-board">
            {targetZones.map((zone) => {
              const zoneParticipants = participantsIn(zone.choice);
              const canReceiveSelection = selectedMemberIds.size > 0;
              return (
                <section
                  className={`vote-zone vote-zone-${zone.choice}${dropZone === zone.choice ? " vote-zone-over" : ""}${canReceiveSelection ? " vote-zone-receiving" : ""}`}
                  aria-label={t(zone.labelKey)}
                  {...zoneDropHandlers(zone.choice)}
                  key={zone.choice}
                >
                  <header className="vote-zone-header">
                    <span>{t(zone.labelKey)}</span>
                    <span className="vote-source-tools">
                      {canReceiveSelection ? (
                        <button
                          className="vote-zone-drop-action"
                          type="button"
                          onClick={() => dropIntoZone(zone.choice)}
                        >
                          {t("live.dropSelectionHere").replace("{count}", formatNumber(selectedMemberIds.size))}
                        </button>
                      ) : null}
                      <strong>{formatNumber(zoneParticipants.length)}</strong>
                    </span>
                  </header>
                  <div className="vote-zone-chips">
                    {zoneParticipants.map((participant) => renderBadge(participant, zone.choice))}
                  </div>
                </section>
              );
            })}
          </div>
          {Object.keys(assignments).length > 0 ? (
            <button
              className="vote-reset"
              type="button"
              onClick={() => {
                setAssignments({});
                setSelectedMemberIds(new Set());
              }}
            >
              {t("live.resetVotes")}
            </button>
          ) : null}
        </>
      ) : (
        <div className="grid gap-3">
          <fieldset className="grid gap-2" data-testid="live-secret-participants">
            <legend>{t("recusal.secretParticipants")}</legend>
            <p className="text-sm text-muted-foreground">{t("recusal.secretParticipantsHint")}</p>
            {participants.map((participant) => (
              <label className="flex items-center gap-2" key={participant.memberId}>
                <input
                  type="checkbox"
                  data-testid={`live-secret-participant-${participant.memberId}`}
                  checked={!secretExcludedIds.has(participant.memberId)}
                  onChange={(event) =>
                    setSecretExcludedIds((previous) => {
                      const next = new Set(previous);
                      if (event.target.checked) next.delete(participant.memberId);
                      else next.add(participant.memberId);
                      return next;
                    })
                  }
                />
                <span>
                  {participant.memberName}
                  {participant.represented
                    ? ` · ${t("live.carriedBy").replace("{holder}", participant.castByName)}`
                    : ""}
                </span>
              </label>
            ))}
            <p data-testid="live-secret-not-voting">
              {t("ballot.notVoting")} : {formatNumber(participants.length - secretParticipants.length)}
            </p>
          </fieldset>
          <div className="vote-secret-counters">
            {secretCounters.map((counter) => (
              <div className="vote-secret-counter" key={counter.key}>
                <span>{t(counter.labelKey)}</span>
                <div>
                  <button
                    type="button"
                    aria-label={`${t(counter.labelKey)} −1`}
                    data-testid={`live-secret-${counter.key}-decrement`}
                    onClick={() => adjustSecretTotal(counter.key, -1)}
                  >
                    −
                  </button>
                  <strong>{formatNumber(secretTotals[counter.key])}</strong>
                  <button
                    type="button"
                    aria-label={`${t(counter.labelKey)} +1`}
                    data-testid={`live-secret-${counter.key}-increment`}
                    onClick={() => adjustSecretTotal(counter.key, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="vote-panel-footer">
        <div className="vote-totals" role="status">
          {method === "public" ? (
            publicComplete ? (
              <>
                <span className="vote-total-for">
                  {t("ballot.votesFor")} <strong>{formatNumber(counts.for)}</strong>
                </span>
                <span className="vote-total-against">
                  {t("ballot.votesAgainst")} <strong>{formatNumber(counts.against)}</strong>
                </span>
                <span className="vote-total-abstain">
                  {t("ballot.abstentions")} <strong>{formatNumber(counts.abstain)}</strong>
                </span>
              </>
            ) : (
              <span className="vote-total-invalid">
                {t("live.assignedProgress")
                  .replace("{assigned}", formatNumber(participants.length - unassigned.length))
                  .replace("{total}", formatNumber(participants.length))}
              </span>
            )
          ) : (
            <span className={secretValid ? "vote-total-for" : "vote-total-invalid"}>
              {t("live.secretTotal")
                .replace("{count}", formatNumber(secretTotalCount))
                .replace("{expected}", formatNumber(secretParticipants.length))}
            </span>
          )}
        </div>
        <div className="vote-panel-footer-actions">
          <button className="vote-cancel" type="button" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </button>
          <button
            className="live-primary-action"
            type="button"
            disabled={submitting || (method === "public" ? !publicComplete : !secretValid)}
            data-testid="live-ballot-record"
            onClick={() => void record()}
          >
            {t(submitting ? "common.saving" : "ballot.recordAction")}
          </button>
        </div>
      </footer>
    </section>
  );
}
