import {
  councilMeetingSchema,
  findSirenAction,
  generateMeetingNoticeMessageSchema,
  meetingNoticeMessagePreparationSchema,
  meetingNoticeSchema,
} from "@hall/api-contract";
import {
  apiPathFromHref,
  apiRequest,
  apiResponse,
  apiSirenRequest,
  SirenCapabilityUnavailable,
  sirenRepresentation,
  submitSirenActionAt,
} from "./apiClient";

const meetingPath = (reference: string) => `/council-meetings/${encodeURIComponent(reference)}`;

export async function resetMeetingAgendaRevision(reference: string) {
  return councilMeetingSchema.parse(
    (await submitSirenActionAt<unknown>(meetingPath(reference), "meeting.reset-agenda-revision", {})).data,
  );
}

export async function reopenMeetingAgenda(reference: string) {
  return councilMeetingSchema.parse(
    (await submitSirenActionAt<unknown>(meetingPath(reference), "meeting.reopen-agenda", {})).data,
  );
}

export async function listMeetingNotices(reference: string) {
  return meetingNoticeSchema.array().parse(await apiRequest<unknown>(`${meetingPath(reference)}/notices`));
}

export async function openMeetingNotice(id: string) {
  const result = await apiSirenRequest<unknown>(`/meeting-notices/${encodeURIComponent(id)}`);
  return { ...result, data: meetingNoticeSchema.parse(result.data) };
}

export async function generateMeetingNotice(reference: string) {
  const result = await submitSirenActionAt<unknown>(meetingPath(reference), "meeting.generate-notice", {});
  return { ...result, data: meetingNoticeSchema.parse(result.data) };
}

export async function prepareMeetingNoticeMessage(reference: string) {
  return meetingNoticeMessagePreparationSchema.parse(
    await apiRequest<unknown>(`${meetingPath(reference)}/notice-message`),
  );
}

export async function downloadMeetingNoticeMessage(reference: string, noticeId: string) {
  const action = findSirenAction(await sirenRepresentation(meetingPath(reference)), "meeting.generate-notice-message");
  if (!action) throw new SirenCapabilityUnavailable("meeting.generate-notice-message");
  const response = await apiResponse(apiPathFromHref(action.href), {
    method: action.method,
    headers: { Accept: "message/rfc822" },
    body: JSON.stringify(generateMeetingNoticeMessageSchema.parse({ noticeId })),
  });
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `convocation-${noticeId}.eml`;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
