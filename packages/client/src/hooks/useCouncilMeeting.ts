import type { CouncilMeeting, MeetingAggregate, MeetingStatus } from "@mairie/domain";
import { useCallback, useEffect, useState } from "react";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  cancelMeetingBallot,
  changeMeetingStatus,
  completeMeetingAgendaItem,
  createMeetingAgendaItem,
  deleteMeetingAgendaItem,
  getCouncilMeeting,
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
  updateMeetingAgendaItem,
} from "../services/councilMeetingsApi";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";

export function useCouncilMeeting(meetingId: string) {
  const [meeting, setMeeting] = useState<MeetingAggregate | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const load = useCallback(async () => {
    try {
      setMeeting(await getCouncilMeeting(meetingId));
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
    async addAgendaItem(input: Record<string, unknown>) {
      setActionError(null);
      try {
        await createMeetingAgendaItem(meetingId, input);
        await load();
        return true;
      } catch (actionFailure) {
        setActionError(apiErrorCode(actionFailure));
        return false;
      }
    },
    async updateAgendaItem(itemId: string, input: Record<string, unknown>) {
      setActionError(null);
      try {
        await updateMeetingAgendaItem(meetingId, itemId, input);
        await load();
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
        await load();
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
        await load();
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
