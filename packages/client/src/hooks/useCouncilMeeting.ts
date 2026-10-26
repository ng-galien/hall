import {
  type ApiActionName,
  type BallotResultPreview,
  type DeclareMeetingAuxiliaryAttendance,
  findSirenAction,
  type MeetingConductWorkspace,
  type PrepareCouncilMeeting,
  type RecordMeetingAttendanceEvents,
  type RecordMeetingOfficerChange,
  type RecordMeetingOpening,
  type RecordMeetingReconvocation,
  type ScheduleAgendaItem,
  type ScheduleCouncilMeeting,
  type SchedulePreparedCouncilSubject,
  type SirenEntity,
} from "@hall/api-contract";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CouncilMeetingWorkspace, councilMeetingView } from "../models/councilMeeting";
import { type LiveBallotSubmission, presentLiveMeeting } from "../models/liveMeeting";
import { openAgendaItemRecusals } from "../services/agendaItemRecusalsApi";
import { ApiError, type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  type BallotPreview,
  confirmBallot,
  listBallotParticipations,
  listBallotVotes,
  listMeetingBallots,
  openBallotResultPreview,
  previewBallot,
} from "../services/ballotsApi";
import {
  addMeetingOpenQuestion,
  adjournMeetingAgendaItem,
  closeCouncilMeeting,
  completeMeetingAgendaItem,
  createAndScheduleCouncilBusiness,
  deprogramMeetingAgendaItem,
  openCouncilMeeting,
  openMeetingAgenda,
  prepareCouncilMeeting,
  reorderMeetingAgenda,
  scheduleCouncilMeeting,
  scheduleMeetingAgendaItem,
  schedulePreparedCouncilSubject,
  startMeetingAgendaItem,
  updateMeetingAgendaItemNotes,
} from "../services/councilMeetingsApi";
import { subscribeLiveUpdates } from "../services/liveUpdates";
import {
  declareMeetingAuxiliaryAttendance,
  openMeetingConduct,
  recordMeetingAttendanceEvents,
  recordMeetingOfficerChange,
  recordMeetingOpening,
  recordMeetingQuorum,
  recordMeetingReconvocation,
} from "../services/meetingConductApi";
import { freezeMeetingAgenda, reopenMeetingAgenda } from "../services/meetingNoticesApi";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";

type LiveActionName = ApiActionName | "meeting.set-officers" | "ballot.record";

const meetingConductActionNames = [
  "meeting.record-opening",
  "meeting.record-attendance",
  "meeting.record-attendance-events",
  "meeting.record-reconvocation",
  "meeting.record-officer-change",
  "meeting.declare-auxiliary-attendance",
  "meeting.set-officers",
  "meeting.add-open-question",
  "meeting.close",
  "agenda-item.start",
  "agenda-item.update-notes",
  "agenda-item.adjourn",
  "agenda-item.complete",
  "ballot.record",
] as const satisfies readonly LiveActionName[];

// @implements-requirement HALL-FR-MTG-320
export function useCouncilMeeting(meetingReference: string) {
  const [workspace, setWorkspace] = useState<CouncilMeetingWorkspace | null>(null);
  const [representations, setRepresentations] = useState<SirenEntity<Record<string, unknown>>[]>([]);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [liveRevision, setLiveRevision] = useState(0);
  const [ballotVotes, setBallotVotes] = useState<ReadonlyMap<string, Awaited<ReturnType<typeof listBallotVotes>>>>(
    new Map(),
  );
  const [ballotParticipantMembers, setBallotParticipantMembers] = useState<
    ReadonlyMap<string, ReadonlyMap<string, string>>
  >(new Map());
  const [ballotPreviews, setBallotPreviews] = useState<ReadonlyMap<string, BallotResultPreview>>(new Map());
  const directoryMembers = useCouncilMembersStore((state) => state.members);
  const members = useMemo(() => directoryMembers.filter((member) => member.active), [directoryMembers]);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const notesRequests = useRef(new Map<string, { text: string; promise: Promise<boolean> }>());
  const loadSequence = useRef(0);
  const saveAgendaItemNotes = useCallback(
    (itemId: string, notes: string): Promise<boolean> => {
      const previous = notesRequests.current.get(itemId);
      if (previous?.text === notes) return previous.promise;
      const save = async () => {
        if (previous) await previous.promise;
        try {
          const saved = await updateMeetingAgendaItemNotes(meetingReference, itemId, notes);
          setWorkspace((value) =>
            value
              ? { ...value, agendaItems: value.agendaItems.map((item) => (item.id === saved.id ? saved : item)) }
              : value,
          );
          setActionError(null);
          return true;
        } catch (failure) {
          setActionError(apiErrorCode(failure));
          return false;
        }
      };
      const promise = save().finally(() => {
        if (notesRequests.current.get(itemId)?.promise === promise) notesRequests.current.delete(itemId);
      });
      notesRequests.current.set(itemId, { text: notes, promise });
      return promise;
    },
    [meetingReference],
  );

  const load = useCallback(async (): Promise<boolean> => {
    const sequence = ++loadSequence.current;
    try {
      const meetingResult = await openCouncilMeeting(meetingReference);
      const [agendaResult, ballots, conductResult] = await Promise.all([
        openMeetingAgenda(meetingReference),
        listMeetingBallots(meetingResult.data.id),
        openMeetingConduct(meetingReference),
      ]);
      if (sequence !== loadSequence.current) return false;
      const agendaItems = agendaResult.data;
      const currentAttendance = conductResult.data.currentAttendance.map((entry) => ({
        id: entry.id,
        councilMeetingId: meetingResult.data.id,
        councilMemberId: entry.councilMemberId,
        status: entry.status,
        proxyHolderCouncilMemberId:
          conductResult.data.currentAttendance.find((holder) => holder.id === entry.proxyHolderAttendanceId)
            ?.councilMemberId ?? null,
        proxyDocumentId: entry.proxyDocumentId,
      }));
      setWorkspace({
        meeting: councilMeetingView(meetingResult.data),
        attendance: currentAttendance,
        agendaItems,
        ballots,
        conduct: conductResult.data,
      });
      setRepresentations([
        ...(meetingResult.representation ? [meetingResult.representation] : []),
        ...(conductResult.representation ? [conductResult.representation] : []),
        ...(agendaResult.representation?.entities ?? []).filter(
          (entity): entity is import("@hall/api-contract").SirenEmbeddedEntity => "properties" in entity,
        ),
      ]);
      setError(null);
      void Promise.all(
        ballots.map(async (ballot) => {
          const [votes, participations, preview] = await Promise.all([
            listBallotVotes(ballot.id),
            listBallotParticipations(ballot.id),
            ballot.resultPreviewId ? openBallotResultPreview(ballot.resultPreviewId) : Promise.resolve(null),
          ]);
          return [
            ballot.id,
            votes,
            new Map(participations.map((entry) => [entry.id, entry.councilMemberId])),
            preview,
          ] as const;
        }),
      )
        .then((details) => {
          if (sequence !== loadSequence.current) return;
          setBallotVotes(new Map(details.map(([id, votes]) => [id, votes])));
          setBallotParticipantMembers(new Map(details.map(([id, , participantMembers]) => [id, participantMembers])));
          setBallotPreviews(new Map(details.flatMap(([id, , , preview]) => (preview ? [[id, preview] as const] : []))));
        })
        .catch((cause) => {
          if (sequence === loadSequence.current) setError(apiErrorCode(cause));
        });
      return true;
    } catch (loadFailure) {
      if (sequence === loadSequence.current) setError(apiErrorCode(loadFailure));
      return false;
    }
  }, [meetingReference]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspace?.meeting.id) return;
    let active = true;
    const refreshFromStream = () => {
      void load().then((refreshed) => {
        if (active && refreshed) setLiveRevision((revision) => revision + 1);
      });
    };
    const unsubscribe = subscribeLiveUpdates(
      { kind: "meeting", id: workspace.meeting.id },
      refreshFromStream,
      refreshFromStream,
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [load, workspace?.meeting.id]);

  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    setActionError(null);
    try {
      await action();
      await Promise.all([load(), useCouncilMeetingsStore.getState().load()]);
      return true;
    } catch (actionFailure) {
      setActionError(apiErrorCode(actionFailure));
      return false;
    }
  }

  // @implements-requirement HALL-FR-WSP-370
  // The documents of each agenda business are loaded on demand, as in the business view.
  const agendaBusinessIds = useMemo(
    () =>
      (workspace?.agendaItems ?? [])
        .map((item) => item.councilBusinessId)
        .filter((id): id is string => Boolean(id))
        .sort()
        .join(","),
    [workspace],
  );
  useEffect(() => {
    if (agendaBusinessIds) void useCouncilBusinessStore.getState().loadResourceItems(agendaBusinessIds.split(","));
  }, [agendaBusinessIds]);

  const meeting = useMemo(
    () =>
      workspace
        ? presentLiveMeeting(workspace, members, businesses, ballotVotes, ballotParticipantMembers, ballotPreviews)
        : null,
    [ballotParticipantMembers, ballotVotes, businesses, members, workspace, ballotPreviews],
  );

  function can(actionName: LiveActionName, targetId?: string): boolean {
    if (actionName === "ballot.record") actionName = "ballot.preview";
    return representations.some(
      (representation) =>
        Boolean(findSirenAction(representation, actionName)) &&
        (!targetId || representation.properties?.id === targetId),
    );
  }

  async function previewLiveBallot(input: LiveBallotSubmission) {
    if (!workspace) throw new Error("The meeting is not loaded");
    const agendaItemId =
      "agendaItemId" in input
        ? input.agendaItemId
        : meeting?.agendaItems.find((item) => item.business.councilDecisionId === input.councilDecisionId)?.id;
    if (!agendaItemId) throw new Error("The ballot target is not scheduled on this meeting");
    const recusalState = await openAgendaItemRecusals(meetingReference, agendaItemId);
    const eligibleAttendance = workspace.attendance.filter(
      (entry) =>
        recusalState.data.eligibleParticipantAttendanceIds.includes(entry.id) ||
        recusalState.data.departedParticipantAttendanceIds.includes(entry.id),
    );
    const participantMemberIds =
      input.method === "public"
        ? new Set(input.votes.map((vote) => vote.memberId))
        : new Set(input.participantMemberIds);
    const selectedAttendance = eligibleAttendance.filter((entry) => participantMemberIds.has(entry.councilMemberId));
    if (selectedAttendance.length !== participantMemberIds.size) throw new ApiError("ballot_voters_invalid", 409);
    if (selectedAttendance.length === 0) throw new ApiError("ballot_voters_invalid", 409);
    const base = {
      procedure: "ordinaryMajority" as const,
      participantAttendanceIds: selectedAttendance.map((entry) => entry.id),
    };
    if (input.method === "public") {
      const choiceByMember = new Map(
        input.votes.flatMap((vote) => (vote.choice === "notVoting" ? [] : [[vote.memberId, vote.choice] as const])),
      );
      return previewBallot(meetingReference, {
        agendaItemId,
        candidate: {
          ...base,
          mode: "public",
          nonParticipations: eligibleAttendance
            .filter((entry) =>
              input.votes.some((vote) => vote.memberId === entry.councilMemberId && vote.choice === "notVoting"),
            )
            .map((entry) => ({
              meetingAttendanceId: entry.id,
              reason: recusalState.data.departedParticipantAttendanceIds.includes(entry.id) ? "departed" : "declined",
            })),
          votes: selectedAttendance
            .filter((entry) => choiceByMember.has(entry.councilMemberId))
            .map((participation) => ({
              meetingAttendanceId: participation.id,
              choice:
                choiceByMember.get(participation.councilMemberId) === "for"
                  ? "approve"
                  : choiceByMember.get(participation.councilMemberId) === "against"
                    ? "reject"
                    : "abstain",
            })),
        },
      });
    } else {
      return previewBallot(meetingReference, {
        agendaItemId,
        candidate: {
          ...base,
          mode: "secret",
          totals: {
            approve: input.totals.votesFor,
            reject: input.totals.votesAgainst,
            abstain: input.totals.abstentions,
            blank: input.totals.blank,
            invalid: input.totals.invalid,
            nonParticipation: input.totals.notVoting,
          },
        },
      });
    }
  }

  return {
    meeting,
    liveRevision,
    conducts: meetingConductActionNames.some((actionName) => can(actionName)),
    workspace,
    can,
    error,
    actionError,
    refresh: async () => {
      await load();
    },
    freezeAgenda() {
      return mutate(() => freezeMeetingAgenda(meetingReference));
    },
    reopenAgenda() {
      return mutate(() => reopenMeetingAgenda(meetingReference));
    },
    schedule(input: ScheduleCouncilMeeting) {
      return mutate(() => scheduleCouncilMeeting(meetingReference, input));
    },
    prepare(input: PrepareCouncilMeeting) {
      return mutate(() => prepareCouncilMeeting(meetingReference, input));
    },
    recordAttendanceEvents(input: RecordMeetingAttendanceEvents) {
      return mutate(() => recordMeetingAttendanceEvents(meetingReference, input));
    },
    recordOfficerChange(input: RecordMeetingOfficerChange) {
      return mutate(() => recordMeetingOfficerChange(meetingReference, input));
    },
    declareAuxiliaryAttendance(input: DeclareMeetingAuxiliaryAttendance) {
      return mutate(() => declareMeetingAuxiliaryAttendance(meetingReference, input));
    },
    recordQuorum() {
      return mutate(() =>
        recordMeetingQuorum(meetingReference, { agendaItemId: null, observedAt: new Date().toISOString() }),
      );
    },
    scheduleAgendaItem(input: ScheduleAgendaItem) {
      return mutate(() => scheduleMeetingAgendaItem(meetingReference, input));
    },
    schedulePreparedSubject(input: SchedulePreparedCouncilSubject) {
      return mutate(() => schedulePreparedCouncilSubject(meetingReference, input));
    },
    deprogramAgendaItem(itemId: string) {
      return mutate(() => deprogramMeetingAgendaItem(meetingReference, itemId));
    },
    reorderAgenda(agendaItemIds: string[]) {
      return mutate(() => reorderMeetingAgenda(meetingReference, { agendaItemIds }));
    },
    async recordOpening(input: RecordMeetingOpening): Promise<MeetingConductWorkspace | null> {
      let result: MeetingConductWorkspace | null = null;
      const saved = await mutate(async () => {
        result = await recordMeetingOpening(meetingReference, input);
      });
      return saved ? result : null;
    },
    startAgendaItem(itemId: string) {
      return mutate(() => startMeetingAgendaItem(meetingReference, itemId, { startedAt: new Date().toISOString() }));
    },
    async close() {
      setActionError(null);
      try {
        await closeCouncilMeeting(meetingReference, { closedAt: new Date().toISOString() });
        await useCouncilMeetingsStore.getState().load();
        return true;
      } catch (failure) {
        setActionError(apiErrorCode(failure));
        return false;
      }
    },
    adjournAgendaItem(itemId: string) {
      return mutate(() => adjournMeetingAgendaItem(meetingReference, itemId));
    },
    completeAgendaItem(itemId: string, _input?: unknown) {
      return mutate(() =>
        completeMeetingAgendaItem(meetingReference, itemId, { completedAt: new Date().toISOString() }),
      );
    },
    previewBallot: previewLiveBallot,
    async confirmBallot(preview: BallotPreview) {
      await confirmBallot(preview);
      await Promise.all([load(), useCouncilMeetingsStore.getState().load()]);
      return true;
    },
    saveAgendaItemNotes,
    createAndScheduleBusiness: async (
      input: { kind: "matter" | "openQuestion"; title: string; report: string; folderPath: string },
      position: number,
    ) =>
      mutate(async () => {
        await createAndScheduleCouncilBusiness(meetingReference, {
          kind: input.kind === "matter" ? "councilDecisionProposal" : "openQuestion",
          path: input.folderPath,
          name: input.title,
          reportName: "Rapport",
          reportContent: input.report,
          position,
        });
        await useCouncilBusinessStore.getState().load();
      }),
    addOpenQuestion: async (input: Parameters<typeof addMeetingOpenQuestion>[1]) =>
      mutate(async () => {
        await addMeetingOpenQuestion(meetingReference, input);
        await useCouncilBusinessStore.getState().load();
      }),
    recordReconvocation(input: RecordMeetingReconvocation) {
      return mutate(() => recordMeetingReconvocation(meetingReference, input));
    },
  };
}
