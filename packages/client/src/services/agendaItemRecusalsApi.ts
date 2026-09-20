import {
  agendaItemRecusalsSchema,
  type RecordAgendaItemRecusal,
  recordAgendaItemRecusalSchema,
  type SirenEntity,
} from "@hall/api-contract";
import { apiSirenRequest, submitSirenAction } from "./apiClient";

export async function openAgendaItemRecusals(meetingReference: string, agendaItemId: string) {
  const result = await apiSirenRequest<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(agendaItemId)}/recusals`,
  );
  return { ...result, data: agendaItemRecusalsSchema.parse(result.data) };
}

export async function recordAgendaItemRecusal(
  representation: SirenEntity<Record<string, unknown>>,
  input: RecordAgendaItemRecusal,
) {
  const result = await submitSirenAction<unknown>(
    representation,
    "agenda-item.record-recusal",
    recordAgendaItemRecusalSchema.parse(input),
  );
  return { ...result, data: agendaItemRecusalsSchema.parse(result.data) };
}
