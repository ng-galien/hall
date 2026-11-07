import {
  type AddOpenQuestion,
  addOpenQuestionSchema,
  adjournAgendaItemSchema,
  agendaItemSchema,
  type CouncilMeeting,
  type CreateAndScheduleCouncilBusiness,
  closeCouncilMeetingSchema,
  completeAgendaItemSchema,
  councilMeetingClosureSchema,
  councilMeetingSchema,
  createAndScheduleCouncilBusinessSchema,
  createdAndScheduledCouncilBusinessSchema,
  type MeetingAttendance,
  meetingAttendanceSchema,
  type PrepareCouncilMeeting,
  prepareCouncilMeetingSchema,
  type ReorderCouncilAgenda,
  reorderCouncilAgendaSchema,
  type ScheduleAgendaItem,
  type ScheduleCouncilMeeting,
  type SchedulePreparedCouncilSubject,
  scheduleAgendaItemSchema,
  scheduleCouncilMeetingSchema,
  schedulePreparedCouncilSubjectSchema,
  startAgendaItemSchema,
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

export async function addMeetingOpenQuestion(meetingReference: string, input: AddOpenQuestion) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}/conduct`,
    "meeting.add-open-question",
    addOpenQuestionSchema.parse(input),
  );
  return agendaItemSchema.parse(result.data);
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

export async function schedulePreparedCouncilSubject(meetingReference: string, input: SchedulePreparedCouncilSubject) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "agenda-item.schedule-prepared",
    schedulePreparedCouncilSubjectSchema.parse(input),
  );
  return agendaItemSchema.parse(result.data);
}

export async function adjournMeetingAgendaItem(meetingReference: string, itemId: string) {
  const path = `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(itemId)}`;
  const result = await submitSirenActionAt<unknown>(path, "agenda-item.adjourn", adjournAgendaItemSchema.parse({}));
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

export async function startMeetingAgendaItem(meetingReference: string, agendaItemId: string) {
  const path = `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(agendaItemId)}`;
  await apiSirenRequest(path);
  const result = await submitSirenActionAt<unknown>(path, "agenda-item.start", startAgendaItemSchema.parse({}));
  return agendaItemSchema.parse(result.data);
}

export async function completeMeetingAgendaItem(meetingReference: string, agendaItemId: string) {
  const path = `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(agendaItemId)}`;
  await apiSirenRequest(path);
  const result = await submitSirenActionAt<unknown>(path, "agenda-item.complete", completeAgendaItemSchema.parse({}));
  return agendaItemSchema.parse(result.data);
}

export async function closeCouncilMeeting(meetingReference: string) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}`,
    "meeting.close",
    closeCouncilMeetingSchema.parse({}),
  );
  return councilMeetingClosureSchema.parse(result.data);
}

export async function updateMeetingAgendaItemNotes(
  meetingReference: string,
  itemId: string,
  discussionSummary: string,
  { clearConfirmed, keepalive = false }: { clearConfirmed: boolean; keepalive?: boolean } = { clearConfirmed: false },
) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(meetingReference)}/agenda-items/${encodeURIComponent(itemId)}`,
    "agenda-item.update-notes",
    updateAgendaItemNotesSchema.parse(clearConfirmed ? { discussionSummary, clearConfirmed } : { discussionSummary }),
    { keepalive },
  );
  return agendaItemSchema.parse(result.data);
}
