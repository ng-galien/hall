import {
  adjournAgendaItemSchema,
  agendaItemSchema,
  type CloseCouncilMeeting,
  type CompleteOpenQuestion,
  type CouncilMeeting,
  type CreateAndScheduleCouncilBusiness,
  closeCouncilMeetingSchema,
  completeOpenQuestionSchema,
  councilMeetingClosureSchema,
  councilMeetingSchema,
  createAndScheduleCouncilBusinessSchema,
  createdAndScheduledCouncilBusinessSchema,
  type MeetingAttendance,
  meetingAttendanceSchema,
  type PrepareCouncilMeeting,
  prepareCouncilMeetingSchema,
  type RecordMeetingAttendance,
  type ReorderCouncilAgenda,
  recordMeetingAttendanceSchema,
  reorderCouncilAgendaSchema,
  type ScheduleAgendaItem,
  type ScheduleCouncilMeeting,
  type SetCouncilMeetingOfficers,
  type StartAgendaItem,
  type StartCouncilMeeting,
  scheduleAgendaItemSchema,
  scheduleCouncilMeetingSchema,
  setCouncilMeetingOfficersSchema,
  startAgendaItemSchema,
  startCouncilMeetingSchema,
  updateAgendaItemNotesSchema,
} from "@hall/api-contract";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

export async function listCouncilMeetings(): Promise<CouncilMeeting[]> {
  return councilMeetingSchema.array().parse(await apiRequest<unknown>("/council-meetings"));
}

export async function openCouncilMeeting(meetingReference: string) {
  const result = await apiSirenRequest<unknown>(`/council-meetings/${encodeURIComponent(meetingReference)}`);
  return { ...result, data: councilMeetingSchema.parse(result.data) };
}

export async function listMeetingAttendance(meetingReference: string): Promise<MeetingAttendance[]> {
  return meetingAttendanceSchema
    .array()
    .parse(await apiRequest<unknown>(`/council-meetings/${encodeURIComponent(meetingReference)}/attendance`));
}

export async function openMeetingAgenda(meetingReference: string) {
  const result = await apiSirenRequest<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items`,
  );
  return { ...result, data: agendaItemSchema.array().parse(result.data) };
}

export async function listMeetingAgenda(meetingReference: string) {
  return agendaItemSchema
    .array()
    .parse(await apiRequest<unknown>(`/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items`));
}

export async function scheduleCouncilMeeting(meetingReference: string, input: ScheduleCouncilMeeting) {
  const parsed = scheduleCouncilMeetingSchema.parse(input);
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.schedule",
    parsed,
  );
  return councilMeetingSchema.parse(result.data);
}

export async function setCouncilMeetingOfficers(meetingReference: string, input: SetCouncilMeetingOfficers) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.set-officers",
    setCouncilMeetingOfficersSchema.parse(input),
  );
  return councilMeetingSchema.parse(result.data);
}

export async function prepareCouncilMeeting(meetingReference: string, input: PrepareCouncilMeeting) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.prepare",
    prepareCouncilMeetingSchema.parse(input),
  );
  return councilMeetingSchema.parse(result.data);
}

export async function createAndScheduleCouncilBusiness(
  meetingReference: string,
  input: CreateAndScheduleCouncilBusiness,
) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.create-and-schedule-business",
    createAndScheduleCouncilBusinessSchema.parse(input),
  );
  return createdAndScheduledCouncilBusinessSchema.parse(result.data);
}

export async function recordMeetingAttendance(meetingReference: string, input: RecordMeetingAttendance) {
  const parsed = recordMeetingAttendanceSchema.parse(input);
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.record-attendance",
    parsed,
  );
  return meetingAttendanceSchema.array().parse(result.data);
}

export async function scheduleMeetingAgendaItem(meetingReference: string, input: ScheduleAgendaItem) {
  const parsed = scheduleAgendaItemSchema.parse(input);
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "agenda-item.schedule",
    parsed,
  );
  return agendaItemSchema.parse(result.data);
}

export async function adjournMeetingAgendaItem(meetingReference: string, itemId: string) {
  const path = `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(itemId)}`;
  const result = await submitSirenActionAt<unknown>(
    path,
    "agenda-item.adjourn",
    adjournAgendaItemSchema.parse({ adjournedAt: new Date().toISOString() }),
  );
  return agendaItemSchema.parse(result.data);
}

export async function deprogramMeetingAgendaItem(meetingReference: string, itemId: string) {
  await submitSirenActionAt(
    `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(itemId)}`,
    "agenda-item.deprogram",
  );
}

export async function reorderMeetingAgenda(meetingReference: string, input: ReorderCouncilAgenda) {
  const parsed = reorderCouncilAgendaSchema.parse(input);
  await submitSirenActionAt(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.reorder-agenda",
    parsed,
  );
}

export async function startCouncilMeeting(meetingReference: string, input: StartCouncilMeeting) {
  const parsed = startCouncilMeetingSchema.parse(input);
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.start",
    parsed,
  );
  return councilMeetingSchema.parse(result.data);
}

export async function startMeetingAgendaItem(meetingReference: string, agendaItemId: string, input: StartAgendaItem) {
  const path = `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(agendaItemId)}`;
  await apiSirenRequest(path);
  const result = await submitSirenActionAt<unknown>(path, "agenda-item.start", startAgendaItemSchema.parse(input));
  return agendaItemSchema.parse(result.data);
}

export async function completeMeetingOpenQuestion(
  meetingReference: string,
  agendaItemId: string,
  input: CompleteOpenQuestion,
) {
  const path = `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(agendaItemId)}`;
  await apiSirenRequest(path);
  const result = await submitSirenActionAt<unknown>(
    path,
    "agenda-item.complete",
    completeOpenQuestionSchema.parse(input),
  );
  return agendaItemSchema.parse(result.data);
}

export async function closeCouncilMeeting(meetingReference: string, input: CloseCouncilMeeting) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.close",
    closeCouncilMeetingSchema.parse(input),
  );
  return councilMeetingClosureSchema.parse(result.data);
}

export async function updateMeetingAgendaItemNotes(
  meetingReference: string,
  itemId: string,
  discussionSummary: string,
) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(itemId)}`,
    "agenda-item.update-notes",
    updateAgendaItemNotesSchema.parse({ discussionSummary }),
  );
  return agendaItemSchema.parse(result.data);
}
