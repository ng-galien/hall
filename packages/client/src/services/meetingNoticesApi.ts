import {
  councilMeetingSchema,
  findSirenLink,
  generateMeetingNoticeMessageSchema,
  meetingNoticeMessagePreparationSchema,
  meetingNoticeSchema,
} from "@hall/api-contract";
import { apiRequest, apiSirenRequest, SirenCapabilityUnavailable, submitSirenActionAt } from "./apiClient";

const meetingPath = (reference: string) => `/council-meetings/${encodeURIComponent(reference)}`;

export async function resetMeetingAgendaRevision(reference: string) {
  return councilMeetingSchema.parse(
    (await submitSirenActionAt<unknown>(meetingPath(reference), "meeting.reset-agenda-revision", {})).data,
  );
}

export async function establishMeetingAgendaRevision(reference: string) {
  return councilMeetingSchema.parse(
    (await submitSirenActionAt<unknown>(meetingPath(reference), "meeting.establish-agenda-revision", {})).data,
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

/** Address of the PDF of a meeting notice, as advertised by its representation. */
export async function meetingNoticeContentHref(id: string) {
  const document = await openMeetingNotice(id);
  const content = document.representation && findSirenLink(document.representation, "content");
  if (!content) throw new SirenCapabilityUnavailable("content");
  return content.href;
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

export async function prepareMeetingNoticeMail(reference: string, noticeId: string) {
  return (
    await submitSirenActionAt<import("@hall/api-contract").MailMessage>(
      meetingPath(reference),
      "meeting.generate-notice-message",
      generateMeetingNoticeMessageSchema.parse({ noticeId }),
    )
  ).data;
}
