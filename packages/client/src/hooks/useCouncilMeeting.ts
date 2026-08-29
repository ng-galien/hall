import { type ApiActionName, findSirenAction, type SirenEntity } from "@hall/api-contract";
import type { CouncilMeeting, MeetingAggregate, MeetingStatus } from "@hall/domain";
import { useCallback, useEffect, useState } from "react";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  attachCouncilDecision,
  createCouncilBusiness,
  detachCouncilDecision,
  scheduleCouncilBusiness,
  updateCouncilBusiness,
} from "../services/councilBusinessApi";
import { updateCouncilDecision } from "../services/councilDecisionsApi";
import {
  cancelMeetingBallot,
  changeMeetingStatus,
  completeMeetingAgendaItem,
  createLateMeetingBusiness,
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
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";

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
    async scheduleCouncilBusiness(businessId: string, position: number) {
      setActionError(null);
      try {
        await scheduleCouncilBusiness(businessId, meetingId, position);
        await Promise.all([load(), useCouncilBusinessStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async createAndScheduleBusiness(input: Record<string, unknown>, position: number) {
      setActionError(null);
      try {
        if (meeting?.meeting.status === "inProgress") {
          await createLateMeetingBusiness(meetingId, input);
        } else {
          const business = await createCouncilBusiness(input);
          await scheduleCouncilBusiness(business.id, meetingId, position);
        }
        await Promise.all([load(), useCouncilBusinessStore.getState().load()]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        await Promise.all([load(), useCouncilBusinessStore.getState().load()]);
        return false;
      }
    },
    async updateCouncilBusiness(businessId: string, input: Record<string, unknown>) {
      setActionError(null);
      try {
        await updateCouncilBusiness(businessId, input);
        await Promise.all([
          load(),
          useCouncilBusinessStore.getState().load(),
          useCouncilDecisionsStore.getState().load(),
        ]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async attachCouncilDecision(businessId: string, draftText: string) {
      setActionError(null);
      try {
        await attachCouncilDecision(businessId, draftText);
        await Promise.all([
          load(),
          useCouncilBusinessStore.getState().load(),
          useCouncilDecisionsStore.getState().load(),
        ]);
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async detachCouncilDecision(businessId: string) {
      setActionError(null);
      try {
        await detachCouncilDecision(businessId);
        await Promise.all([
          load(),
          useCouncilBusinessStore.getState().load(),
          useCouncilDecisionsStore.getState().load(),
        ]);
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
        await Promise.all([load(), useCouncilBusinessStore.getState().load()]);
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
        await Promise.all([load(), useCouncilBusinessStore.getState().load()]);
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
