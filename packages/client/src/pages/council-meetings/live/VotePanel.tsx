// biome-ignore-all lint/correctness/useExhaustiveDependencies: Voting-context changes intentionally invalidate a preview.
import { findSirenAction } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { type DragEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, RequestErrorBanner } from "../../../components/Ui";
import { Button } from "../../../components/ui/button";
import { ballotVerdictKey } from "../../../features/council-meetings/ballotVerdictPresentation";
import { useSubmitting } from "../../../hooks/useSubmitting";
import type { TranslationKey } from "../../../i18n/en";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../../models/directory";
import type {
  LiveBallotMethod as BallotMethod,
  LiveMeetingPresentation,
  LiveBallotSubmission as RecordBallotInput,
  LiveVoteChoice as VoteChoice,
} from "../../../models/liveMeeting";
import { type ApiErrorCode, apiErrorCode } from "../../../services/apiClient";
import type { BallotPreview } from "../../../services/ballotsApi";
import { type BallotParticipant, ballotParticipants, councilMemberName } from "../ballotParticipants";

type SecretBallotTotals = Extract<RecordBallotInput, { method: "secret" }>["totals"];

type AssignmentChoice = VoteChoice | "blank" | "invalid";
type ZoneChoice = AssignmentChoice | "unassigned";

function publicChoice(choice: AssignmentChoice): VoteChoice {
  return matchLiteral(choice, {
    for: () => "for" as const,
    against: () => "against" as const,
    abstain: () => "abstain" as const,
    notVoting: () => "notVoting" as const,
    blank: () => {
      throw new Error("Blank is only available for secret ballots");
    },
    invalid: () => {
      throw new Error("Invalid is only available for secret ballots");
    },
  });
}

const targetZones: { choice: VoteChoice; labelKey: TranslationKey }[] = [
  { choice: "for", labelKey: "ballot.choice.for" },
  { choice: "against", labelKey: "ballot.choice.against" },
  { choice: "abstain", labelKey: "ballot.choice.abstain" },
  { choice: "notVoting", labelKey: "ballot.choice.notVoting" },
];
const secretTargetZones: { choice: AssignmentChoice; labelKey: TranslationKey }[] = [
  ...targetZones,
  { choice: "blank", labelKey: "ballot.blank" },
  { choice: "invalid", labelKey: "ballot.invalid" },
];

const publicCounters: { key: keyof SecretBallotTotals; labelKey: TranslationKey }[] = [
  { key: "votesFor", labelKey: "ballot.votesFor" },
  { key: "votesAgainst", labelKey: "ballot.votesAgainst" },
  { key: "abstentions", labelKey: "ballot.abstentions" },
];
const secretCounters: typeof publicCounters = [
  ...publicCounters,
  { key: "blank", labelKey: "ballot.blank" },
  { key: "invalid", labelKey: "ballot.invalid" },
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
          {proxyVote ? t("live.carriedBy", { holder: participant.castByName }) : member ? t(`role.${member.role}`) : ""}
        </span>
      </span>
      {!proxyVote && carriedCount > 0 ? (
        <span className="vote-card-proxy-count" title={t("live.holdsProxies", { count: formatNumber(carriedCount) })}>
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
  isMinutes,
  open,
  onOpenChange,
  onPreview,
  onConfirm,
  eligibleAttendanceIds,
  departedAttendanceIds,
  actionContainer,
}: {
  aggregate: LiveMeetingPresentation;
  members: CouncilMemberView[];
  target: { councilDecisionId: string } | { agendaItemId: string };
  isMinutes: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPreview(input: RecordBallotInput): Promise<BallotPreview>;
  onConfirm(preview: BallotPreview): Promise<boolean>;
  eligibleAttendanceIds: readonly string[];
  departedAttendanceIds: readonly string[];
  actionContainer: HTMLElement | null;
}) {
  const { t, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const [method, setMethod] = useState<BallotMethod>("public");
  const [assignments, setAssignments] = useState<Partial<Record<string, AssignmentChoice>>>({});
  const [selectedMemberIds, setSelectedMemberIds] = useState<ReadonlySet<string>>(new Set());
  const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<ZoneChoice | null>(null);
  const [preview, setPreview] = useState<BallotPreview | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [chairmanMemberId, setChairmanMemberId] = useState(aggregate.meeting.chairMemberId ?? "");
  const departedParticipants = aggregate.attendance
    .filter((entry) => departedAttendanceIds.includes(entry.id))
    .map((entry) => ({
      memberId: entry.memberId,
      castByMemberId: entry.memberId,
      memberName: councilMemberName(members, entry.memberId),
      castByName: councilMemberName(members, entry.memberId),
      represented: false,
    }));
  const departedMemberIds = new Set(departedParticipants.map((entry) => entry.memberId));
  const participants = [
    ...ballotParticipants(
      { ...aggregate, attendance: aggregate.attendance.filter((entry) => eligibleAttendanceIds.includes(entry.id)) },
      members,
    ),
    ...departedParticipants,
  ];
  const eligibleIdentity = [...eligibleAttendanceIds, ...departedAttendanceIds].join(",");
  useEffect(() => {
    setPreview(null);
  }, [method, assignments, chairmanMemberId, eligibleIdentity]);

  const memberById = new Map(members.map((member) => [member.id, member]));
  const carriedCountByHolder = participants.reduce<Map<string, number>>((accumulator, participant) => {
    if (participant.memberId !== participant.castByMemberId) {
      accumulator.set(participant.castByMemberId, (accumulator.get(participant.castByMemberId) ?? 0) + 1);
    }
    return accumulator;
  }, new Map());

  const zoneOf = (memberId: string): ZoneChoice =>
    departedMemberIds.has(memberId) ? "notVoting" : (assignments[memberId] ?? "unassigned");
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

  const secretTotals: SecretBallotTotals = {
    votesFor: counts.for,
    votesAgainst: counts.against,
    abstentions: counts.abstain,
    notVoting: counts.notVoting,
    blank: participantsIn("blank").length,
    invalid: participantsIn("invalid").length,
  };
  const secretParticipants = participants.filter((participant) => zoneOf(participant.memberId) !== "notVoting");
  const secretTotalCount =
    secretTotals.votesFor +
    secretTotals.votesAgainst +
    secretTotals.abstentions +
    secretTotals.blank +
    secretTotals.invalid;
  const secretValid = secretTotalCount === secretParticipants.length && secretParticipants.length > 0;
  const publicComplete = unassigned.length === 0 && participants.length > 0;

  const record = () =>
    run(async () => {
      const input: RecordBallotInput =
        method === "public"
          ? {
              method,
              chairmanMemberId,
              ...target,
              votes: participants.map((participant) => ({
                memberId: participant.memberId,
                castByMemberId: participant.castByMemberId,
                choice: departedMemberIds.has(participant.memberId)
                  ? "notVoting"
                  : publicChoice(assignments[participant.memberId] ?? "notVoting"),
              })),
            }
          : {
              method,
              chairmanMemberId,
              ...target,
              participantMemberIds: participants.map((participant) => participant.memberId),
              totals: secretTotals,
            };
      setError(null);
      try {
        setPreview(await onPreview(input));
      } catch (cause) {
        setError(apiErrorCode(cause));
      }
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

  const renderBadge = (participant: BallotParticipant, zone: ZoneChoice) =>
    departedMemberIds.has(participant.memberId) ? (
      <span
        key={participant.memberId}
        className="vote-card"
        data-testid={`live-departed-member-${participant.memberId}`}
      >
        {participant.memberName} : {t("ballot.departed")}
      </span>
    ) : (
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
        <p className="vote-eligible-hint">{t("ballot.eligibleCount", { count: formatNumber(participants.length) })}</p>
      </section>
    );
  }

  return (
    <section className="vote-panel" aria-labelledby="vote-panel-heading">
      <header className="vote-panel-header">
        <h2 id="vote-panel-heading">{t("ballot.itemTitle")}</h2>
        <div className="vote-method-toggle">
          <button
            className={`vote-method-choice${method === "public" ? " vote-method-choice-active" : ""}`}
            type="button"
            aria-pressed={method === "public"}
            data-testid="live-ballot-mode-public"
            onClick={() => {
              if (method !== "public") {
                setAssignments({});
                setSelectedMemberIds(new Set());
                setMethod("public");
              }
            }}
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

      {
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
            {(method === "public" ? targetZones : secretTargetZones).map((zone) => {
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
                          data-testid={`live-vote-assign-${zone.choice}`}
                          onClick={() => dropIntoZone(zone.choice)}
                        >
                          {t("live.dropSelectionHere", { count: formatNumber(selectedMemberIds.size) })}
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
      }

      <label className="grid gap-2">
        {t("ballot.chairman")}
        <select
          data-testid="live-ballot-chairman"
          value={chairmanMemberId}
          onChange={(event) => setChairmanMemberId(event.target.value)}
        >
          <option value="">{t("ballot.chooseChairman")}</option>
          {participants
            .filter((participant) =>
              aggregate.attendance.some(
                (entry) => entry.memberId === participant.memberId && entry.status === "present",
              ),
            )
            .map((participant) => (
              <option key={participant.memberId} value={participant.memberId}>
                {participant.memberName}
              </option>
            ))}
        </select>
      </label>
      <RequestErrorBanner error={error} />
      {preview ? (
        <Modal
          open
          title={t("ballot.previewTitle")}
          onClose={() => {
            if (!submitting) setPreview(null);
          }}
        >
          <div className="ballot-preview" data-testid="live-ballot-preview">
            <p className="ballot-preview-hint">{t("ballot.previewHint")}</p>
            <strong className="ballot-preview-result" data-testid="live-ballot-preview-result">
              {t(ballotVerdictKey(isMinutes, preview.data.calculation.result === "approve"))}
            </strong>
            <p className="ballot-preview-hint">
              {t("ballot.previewQuorum")} : {formatNumber(preview.data.quorum.presentCount)} /{" "}
              {formatNumber(preview.data.quorum.requiredPresent)}
            </p>
            <dl className="ballot-preview-totals">
              {matchLiteral(preview.data.candidate.mode, {
                public: () => publicCounters,
                secret: () => secretCounters,
              }).map(({ key, labelKey }) => {
                const totalKeys = {
                  votesFor: "approve",
                  votesAgainst: "reject",
                  abstentions: "abstain",
                  blank: "blank",
                  invalid: "invalid",
                  notVoting: "nonParticipation",
                } as const;
                return (
                  <div key={key}>
                    <dt>{t(labelKey)}</dt>
                    <dd data-testid={`live-ballot-preview-total-${totalKeys[key]}`}>
                      {formatNumber(preview.data.calculation.totals[totalKeys[key]])}
                    </dd>
                  </div>
                );
              })}
              <div>
                <dt>{t("ballot.notVoting")}</dt>
                <dd data-testid="live-ballot-preview-total-nonParticipation">
                  {formatNumber(preview.data.calculation.totals.nonParticipation)}
                </dd>
              </div>
            </dl>
            <RequestErrorBanner error={error} />
            <div className="ballot-preview-actions">
              <Button
                data-testid="live-ballot-preview-correct"
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setPreview(null);
                  setError(null);
                }}
              >
                {t("ballot.correct")}
              </Button>
              <Button
                data-testid="live-ballot-preview-confirm"
                disabled={submitting || !findSirenAction(preview.representation, "ballot.confirm")}
                onClick={() =>
                  void run(async () => {
                    setError(null);
                    try {
                      if (await onConfirm(preview)) {
                        setPreview(null);
                        onOpenChange(false);
                      } else setError("request_failed");
                    } catch (cause) {
                      setError(apiErrorCode(cause));
                    }
                  })
                }
              >
                {t(submitting ? "common.saving" : "ballot.confirm")}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
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
                {t("live.assignedProgress", {
                  assigned: formatNumber(participants.length - unassigned.length),
                  total: formatNumber(participants.length),
                })}
              </span>
            )
          ) : (
            <span className={secretValid ? "vote-total-for" : "vote-total-invalid"}>
              {t("live.secretTotal", {
                count: formatNumber(secretTotalCount),
                expected: formatNumber(secretParticipants.length),
              })}
            </span>
          )}
        </div>
        <div className="vote-panel-footer-actions">
          <button className="vote-cancel" type="button" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </button>
          {actionContainer
            ? createPortal(
                <button
                  className="live-primary-action"
                  type="button"
                  disabled={
                    submitting ||
                    !participants.some(
                      (participant) =>
                        participant.memberId === chairmanMemberId &&
                        aggregate.attendance.some(
                          (entry) => entry.memberId === chairmanMemberId && entry.status === "present",
                        ),
                    ) ||
                    (method === "public" ? !publicComplete : !secretValid)
                  }
                  data-testid="live-ballot-preview-open"
                  onClick={() => void record()}
                >
                  {t(submitting ? "common.saving" : "ballot.previewAction")}
                </button>,
                actionContainer,
              )
            : null}
        </div>
      </footer>
    </section>
  );
}
