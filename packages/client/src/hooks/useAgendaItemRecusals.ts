import { findSirenAction, type RecordAgendaItemRecusal } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { openAgendaItemRecusals, recordAgendaItemRecusal } from "../services/agendaItemRecusalsApi";
import { apiErrorCode, type ApiErrorCode } from "../services/apiClient";

export function useAgendaItemRecusals(meetingReference: string, agendaItemId: string | null, revision: string) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof openAgendaItemRecusals>> | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const activeRequest = useRef(0);
  const recording = useRef(false);
  const load = useCallback(async () => {
    const request = ++activeRequest.current;
    if (!agendaItemId) {
      setResult(null);
      return;
    }
    try {
      const next = await openAgendaItemRecusals(meetingReference, agendaItemId);
      if (request === activeRequest.current) {
        setResult(next);
        setError(null);
      }
    } catch (cause) {
      if (request === activeRequest.current) {
        setResult(null);
        setError(apiErrorCode(cause));
      }
    }
  }, [meetingReference, agendaItemId]);
  useEffect(() => {
    void load();
    return () => {
      activeRequest.current++;
    };
  }, [load, revision]);
  const current = result?.data.agendaItem.id === agendaItemId ? result : null;
  return {
    state: current?.data ?? null,
    canRecord: Boolean(
      current?.representation && findSirenAction(current.representation, "agenda-item.record-recusal"),
    ),
    error,
    submitting,
    reload: load,
    async record(input: RecordAgendaItemRecusal) {
      if (recording.current || !current?.representation) return false;
      recording.current = true;
      setSubmitting(true);
      try {
        await recordAgendaItemRecusal(current.representation, input);
        await load();
        return true;
      } catch (cause) {
        setError(apiErrorCode(cause));
        return false;
      } finally {
        recording.current = false;
        setSubmitting(false);
      }
    },
  };
}
