import { type ApiActionName, findSirenAction, type SirenEntity } from "@mairie/api-contract";
import type { CouncilMeeting, MeetingAggregate, MeetingStatus } from "@mairie/domain";
import { useCallback, useEffect, useState } from "react";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { updateCouncilDecision } from "../services/councilDecisionsApi";
import {
  cancelMeetingBallot,
  changeMeetingStatus,
  completeMeetingAgendaItem,
  createLateMeetingTopic,
  deleteMeetingAgendaItem,
  getCouncilMeetingSiren,
  type RecordBallotInput,
  reconveneCouncilMeeting,
  recordMeetingAttendance,
  recordMeetingBallot,
  recordMeetingQuorumFailure,
  reorderMeetingAgenda,
  saveMeetingAgendaItemNotes,
  setMeetingOfficers,
  startMeetingAgendaItem,
  updateCouncilMeeting,
} from "../services/councilMeetingsApi";
import {
  attachTopicDecision,
  createTopic,
  detachTopicDecision,
  scheduleTopic,
  updateTopic,
} from "../services/topicsApi";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useTopicsStore } from "../stores/topicsStore";

export function useCouncilMeeting(meetingId: string) {
  const [meeting, setMeeting] = useState<MeetingAggregate | null>(null);
  const [representation, setRepresentation] = useState<SirenEntity<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const load = useCallback(async () => {
    try {
      const result = await getCouncilMeetingSiren(meetingId);
      setMeeting(result.data);
      setRepresentation(result.representation);
      setError(null);
    } catch (loadFailure) {
      setError(apiErrorCode(loadFailure));
    }
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    meeting,
    can(actionName: ApiActionName, entityId?: string) {
      if (!representation) return false;
      if (!entityId) return Boolean(findSirenAction(representation, actionName));
      return Boolean(
        representation.entities?.some(
          (entity) =>
            "properties" in entity &&
            entity.properties &&
            "id" in entity.properties &&
            entity.properties.id === entityId &&
            findSirenAction(entity, actionName),
        ),
      );
    },
    error,
    actionError,
    async updateMeeting(input: Record<string, unknown>) {
      setActionError(null);
      try {
        await updateCouncilMeeting(meetingId, input);
        await Promise.all([load(), useCouncilMeetingsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async recordAttendance(input: Record<string, unknown>) {
      setActionError(null);
      try {
        await recordMeetingAttendance(meetingId, input);
        await load();
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async scheduleTopic(topicId: string, position: number) {
      setActionError(null);
      try {
        await scheduleTopic(topicId, meetingId, position);
        await Promise.all([load(), useTopicsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async createAndScheduleTopic(input: Record<string, unknown>, position: number) {
      setActionError(null);
      try {
        if (meeting?.meeting.status === "inProgress") {
          await createLateMeetingTopic(meetingId, input);
        } else {
          const topic = await createTopic(input);
          await scheduleTopic(topic.id, meetingId, position);
        }
        await Promise.all([load(), useTopicsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        await Promise.all([load(), useTopicsStore.getState().load()]);
        return false;
      }
    },
    async updateTopic(topicId: string, input: Record<string, unknown>) {
      setActionError(null);
      try {
        await updateTopic(topicId, input);
        await Promise.all([load(), useTopicsStore.getState().load(), useCouncilDecisionsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async attachTopicDecision(topicId: string, draftText: string) {
      setActionError(null);
      try {
        await attachTopicDecision(topicId, draftText);
        await Promise.all([load(), useTopicsStore.getState().load(), useCouncilDecisionsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async detachTopicDecision(topicId: string) {
      setActionError(null);
      try {
        await detachTopicDecision(topicId);
        await Promise.all([load(), useTopicsStore.getState().load(), useCouncilDecisionsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async updateDecision(decisionId: string, input: { title: string; draftText: string }) {
      setActionError(null);
      try {
        await updateCouncilDecision(decisionId, input);
        await Promise.all([load(), useCouncilDecisionsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async removeAgendaItem(itemId: string) {
      setActionError(null);
      try {
        await deleteMeetingAgendaItem(meetingId, itemId);
        await Promise.all([load(), useTopicsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async reorderAgenda(itemIds: string[]) {
      setActionError(null);
      try {
        await reorderMeetingAgenda(meetingId, itemIds);
        await load();
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async startAgendaItem(itemId: string) {
      setActionError(null);
      try {
        await startMeetingAgendaItem(meetingId, itemId);
        await load();
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async saveAgendaItemNotes(itemId: string, discussionSummary: string) {
      setActionError(null);
      try {
        await saveMeetingAgendaItemNotes(meetingId, itemId, discussionSummary);
        await load();
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async completeAgendaItem(itemId: string, input: Record<string, unknown>) {
      setActionError(null);
      try {
        await completeMeetingAgendaItem(meetingId, itemId, input);
        await Promise.all([load(), useTopicsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async changeStatus(status: MeetingStatus) {
      setActionError(null);
      try {
        await changeMeetingStatus(meetingId, status);
        await load();
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async setOfficers(input: Record<string, unknown>) {
      setActionError(null);
      try {
        await setMeetingOfficers(meetingId, input);
        await load();
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async recordQuorumFailure() {
      setActionError(null);
      try {
        await recordMeetingQuorumFailure(meetingId);
        await load();
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async cancelBallot(ballotId: string) {
      setActionError(null);
      try {
        await cancelMeetingBallot(meetingId, ballotId);
        await Promise.all([load(), useCouncilDecisionsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async recordBallot(input: RecordBallotInput) {
      setActionError(null);
      try {
        await recordMeetingBallot(meetingId, input);
        await Promise.all([load(), useCouncilDecisionsStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async reconvene(input: Record<string, unknown>): Promise<CouncilMeeting | null> {
      setActionError(null);
      try {
        return await reconveneCouncilMeeting(meetingId, input);
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return null;
      }
    },
  };
}
