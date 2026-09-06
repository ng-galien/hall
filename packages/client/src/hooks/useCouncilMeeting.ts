import {
  type ApiActionName,
  type CreateBallot,
  findSirenAction,
  type RecordBallotVotes,
  type RecordMeetingAttendance,
  type ScheduleAgendaItem,
  type ScheduleCouncilMeeting,
  type SirenEntity,
} from "@hall/api-contract";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CouncilMeetingWorkspace, councilMeetingView } from "../models/councilMeeting";
import { type LiveBallotSubmission, presentLiveMeeting } from "../models/liveMeeting";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  completeBallot,
  createBallot,
  listBallotParticipations,
  listBallotVotes,
  listMeetingBallots,
  recordBallotVotes,
} from "../services/ballotsApi";
import {
  adjournMeetingAgendaItem,
  closeCouncilMeeting,
  completeMeetingOpenQuestion,
  createAndScheduleCouncilBusiness,
  deprogramMeetingAgendaItem,
  listMeetingAttendance,
  openCouncilMeeting,
  openMeetingAgenda,
  recordMeetingAttendance,
  reorderMeetingAgenda,
  scheduleCouncilMeeting,
  scheduleMeetingAgendaItem,
  setCouncilMeetingOfficers,
  startCouncilMeeting,
  startMeetingAgendaItem,
  updateMeetingAgendaItemNotes,
} from "../services/councilMeetingsApi";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";

type LiveActionName =
  | ApiActionName
  | "meeting.open"
  | "meeting.set-officers"
  | "meeting.reconvene"
  | "meeting.record-quorum-failure"
  | "meeting.add-late-business"
  | "ballot.record"
  | "ballot.cancel";

export function useCouncilMeeting(meetingReference: string) {
  const [workspace, setWorkspace] = useState<CouncilMeetingWorkspace | null>(null);
  const [representations, setRepresentations] = useState<SirenEntity<Record<string, unknown>>[]>([]);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [ballotVotes, setBallotVotes] = useState<ReadonlyMap<string, Awaited<ReturnType<typeof listBallotVotes>>>>(
    new Map(),
  );
  const [ballotParticipantMembers, setBallotParticipantMembers] = useState<
    ReadonlyMap<string, ReadonlyMap<string, string>>
  >(new Map());
  const directoryMembers = useCouncilMembersStore((state) => state.members);
  const members = useMemo(() => directoryMembers.filter((member) => member.active), [directoryMembers]);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const notesRequests = useRef(new Map<string, { text: string; promise: Promise<boolean> }>());
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

  const load = useCallback(async () => {
    try {
      const meetingResult = await openCouncilMeeting(meetingReference);
      const [attendance, agendaResult, ballots] = await Promise.all([
        listMeetingAttendance(meetingReference),
        openMeetingAgenda(meetingReference),
        listMeetingBallots(meetingResult.data.id),
      ]);
      const agendaItems = agendaResult.data;
      setWorkspace({ meeting: councilMeetingView(meetingResult.data), attendance, agendaItems, ballots });
      setRepresentations([
        ...(meetingResult.representation ? [meetingResult.representation] : []),
        ...(agendaResult.representation?.entities ?? []).filter(
          (entity): entity is import("@hall/api-contract").SirenEmbeddedEntity => "properties" in entity,
        ),
      ]);
      setError(null);
      void Promise.all(
        ballots.map(async (ballot) => {
          const [votes, participations] = await Promise.all([
            listBallotVotes(ballot.id),
            listBallotParticipations(ballot.id),
          ]);
          return [ballot.id, votes, new Map(participations.map((entry) => [entry.id, entry.councilMemberId]))] as const;
        }),
      ).then((details) => {
        setBallotVotes(new Map(details.map(([id, votes]) => [id, votes])));
        setBallotParticipantMembers(new Map(details.map(([id, , participantMembers]) => [id, participantMembers])));
      });
    } catch (loadFailure) {
      setError(apiErrorCode(loadFailure));
    }
  }, [meetingReference]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const meeting = useMemo(
    () =>
      workspace ? presentLiveMeeting(workspace, members, businesses, ballotVotes, ballotParticipantMembers) : null,
    [ballotParticipantMembers, ballotVotes, businesses, members, workspace],
  );

  function can(actionName: LiveActionName, targetId?: string): boolean {
    if (actionName === "meeting.open") actionName = "meeting.start";
    if (actionName === "meeting.reconvene" || actionName === "meeting.record-quorum-failure") {
      return false;
    }
    if (actionName === "meeting.add-late-business" || actionName === "ballot.cancel") return false;
    if (actionName === "ballot.record") actionName = "ballot.create";
    return representations.some(
      (representation) =>
        Boolean(findSirenAction(representation, actionName)) &&
        (!targetId || representation.properties?.id === targetId),
    );
  }

  async function recordLiveBallot(input: LiveBallotSubmission): Promise<boolean> {
    if (!workspace) return false;
    return mutate(async () => {
      const agendaItemId =
        "agendaItemId" in input
          ? input.agendaItemId
          : meeting?.agendaItems.find((item) => item.business.councilDecisionId === input.councilDecisionId)?.id;
      if (!agendaItemId) throw new Error("The ballot target is not scheduled on this meeting");
      const eligibleAttendance = workspace.attendance.filter(
        (entry) => entry.status === "present" || entry.status === "represented",
      );
      const participantMemberIds =
        input.method === "public"
          ? new Set(input.votes.filter((vote) => vote.choice !== "notVoting").map((vote) => vote.memberId))
          : null;
      const participantCount =
        input.method === "secret"
          ? input.totals.votesFor + input.totals.votesAgainst + input.totals.abstentions
          : participantMemberIds!.size;
      const selectedAttendance =
        input.method === "public"
          ? eligibleAttendance.filter((entry) => participantMemberIds!.has(entry.councilMemberId))
          : eligibleAttendance.slice(0, participantCount);
      const chairman = selectedAttendance.find((entry) => entry.councilMemberId === workspace.meeting.chairMemberId);
      if (!chairman || selectedAttendance.length === 0) throw new Error("A ballot requires a present chairman");
      const ballot = await createBallot(workspace.meeting.id, {
        agendaItemId,
        mode: input.method,
        participantAttendanceIds: selectedAttendance.map((entry) => entry.id),
        chairmanAttendanceId: chairman.id,
      });
      const participations = await listBallotParticipations(ballot.id);
      if (input.method === "public") {
        const choiceByMember = new Map(
          input.votes.flatMap((vote) => (vote.choice === "notVoting" ? [] : [[vote.memberId, vote.choice] as const])),
        );
        await recordBallotVotes(ballot.id, {
          mode: "public",
          votes: participations.map((participation) => ({
            ballotParticipationId: participation.id,
            choice:
              choiceByMember.get(participation.councilMemberId) === "for"
                ? "approve"
                : choiceByMember.get(participation.councilMemberId) === "against"
                  ? "reject"
                  : "abstain",
          })),
        });
      } else {
        await recordBallotVotes(ballot.id, {
          mode: "secret",
          totals: {
            approve: input.totals.votesFor,
            reject: input.totals.votesAgainst,
            abstain: input.totals.abstentions,
          },
        });
      }
      await completeBallot(ballot.id, { completedAt: new Date().toISOString() });
    });
  }

  return {
    meeting,
    workspace,
    can,
    error,
    actionError,
    schedule(input: ScheduleCouncilMeeting) {
      return mutate(() => scheduleCouncilMeeting(meetingReference, input));
    },
    recordAttendance(input: RecordMeetingAttendance) {
      return mutate(() => recordMeetingAttendance(meetingReference, input));
    },
    scheduleAgendaItem(input: ScheduleAgendaItem) {
      return mutate(() => scheduleMeetingAgendaItem(meetingReference, input));
    },
    deprogramAgendaItem(itemId: string) {
      return mutate(() => deprogramMeetingAgendaItem(meetingReference, itemId));
    },
    reorderAgenda(agendaItemIds: string[]) {
      return mutate(() => reorderMeetingAgenda(meetingReference, { agendaItemIds }));
    },
    start() {
      return mutate(() => startCouncilMeeting(meetingReference, { startedAt: new Date().toISOString() }));
    },
    startAgendaItem(itemId: string) {
      return mutate(() => startMeetingAgendaItem(meetingReference, itemId, { startedAt: new Date().toISOString() }));
    },
    completeOpenQuestion(itemId: string) {
      return mutate(() =>
        completeMeetingOpenQuestion(meetingReference, itemId, { completedAt: new Date().toISOString() }),
      );
    },
    saveDecisionText(proposalId: string, input: { title: string; draftText: string }) {
      return mutate(async () => {
        const subject = workspace?.agendaItems.find((item) => item.subject.id === proposalId)?.subject;
        if (subject?.kind !== "councilDecisionProposal") throw new Error("Unknown decision proposal");
        const resources = useWorkspaceResourcesStore.getState();
        const opened = await resources.open(subject.textResourceId);
        if (!opened || opened.data.kind !== "text") throw new Error("Proposal text unavailable");
        const saved = await resources.updateContent(subject.textResourceId, {
          kind: "text",
          expectedVersion: opened.data.version,
          content: input.draftText,
        });
        if (!saved) throw new Error("Proposal text could not be saved");
      });
    },
    updateBusiness(businessId: string, input: Record<string, unknown>) {
      return mutate(async () => {
        const business = businesses.find((candidate) => candidate.id === businessId);
        if (!business || typeof input.report !== "string" || typeof input.title !== "string")
          throw new Error("Invalid business edit");
        const resources = useWorkspaceResourcesStore.getState();
        const report = await resources.open(business.reportResourceId);
        if (!report || report.data.kind !== "text") throw new Error("Report unavailable");
        if (
          !(await resources.updateContent(business.reportResourceId, {
            kind: "text",
            expectedVersion: report.data.version,
            content: input.report,
          }))
        )
          throw new Error("Report could not be saved");
        const folder = await resources.open(business.folderResourceId);
        if (!folder || folder.data.kind !== "folder") throw new Error("Folder unavailable");
        if (
          folder.data.name !== input.title &&
          !(await resources.updateMetadata(business.folderResourceId, {
            path: folder.data.path,
            name: input.title,
            tags: folder.data.tags,
            editing: { kind: "fixed" },
          }))
        )
          throw new Error("Business title could not be saved");
        await useCouncilBusinessStore.getState().load();
      });
    },
    createBallot(input: CreateBallot) {
      return workspace ? mutate(() => createBallot(workspace.meeting.id, input)) : Promise.resolve(false);
    },
    recordBallotVotes(ballotId: string, input: RecordBallotVotes) {
      return mutate(() => recordBallotVotes(ballotId, input));
    },
    completeBallot(ballotId: string) {
      return mutate(() => completeBallot(ballotId, { completedAt: new Date().toISOString() }));
    },
    close() {
      return mutate(() => closeCouncilMeeting(meetingReference, { closedAt: new Date().toISOString() }));
    },
    changeStatus(status: "inProgress" | "closed") {
      return status === "inProgress"
        ? mutate(() => startCouncilMeeting(meetingReference, { startedAt: new Date().toISOString() }))
        : mutate(() => closeCouncilMeeting(meetingReference, { closedAt: new Date().toISOString() }));
    },
    adjournAgendaItem(itemId: string) {
      return mutate(() => adjournMeetingAgendaItem(meetingReference, itemId));
    },
    completeAgendaItem(itemId: string, _input?: unknown) {
      return mutate(() =>
        completeMeetingOpenQuestion(meetingReference, itemId, { completedAt: new Date().toISOString() }),
      );
    },
    recordBallot: recordLiveBallot,
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
    cancelBallot: async (_ballotId: string) => false,
    setOfficers(input: { chairMemberId: string; secretaryMemberId: string }) {
      return mutate(() => setCouncilMeetingOfficers(meetingReference, input));
    },
    reconvene: async (_input: Record<string, unknown>): Promise<{ slug: string } | null> => null,
    recordQuorumFailure: async () => false,
  };
}
