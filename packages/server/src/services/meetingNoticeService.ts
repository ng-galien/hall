import { type MeetingNotice, type MeetingNoticeFacts, meetingNoticeHallFactsSchema } from "@hall/domain";
import type { CouncilClient } from "../clients/councilClient.js";
import type { DocumentRenderer } from "./documentRenderer.js";
import { DomainError } from "./errors.js";
import type { HallSettingsService } from "./hallSettingsService.js";
import { renderMeetingNotice } from "./meetingNoticeDocument.js";

export interface MeetingNoticeService {
  list(meetingId: string): Promise<MeetingNotice[]>;
  open(id: string): Promise<MeetingNotice>;
  generate(meetingId: string): Promise<MeetingNotice>;
  content(id: string): Promise<Buffer>;
}
export function createMeetingNoticeService({ councilClient, hallSettingsService, documentRenderer }: {
  councilClient: CouncilClient; hallSettingsService: HallSettingsService; documentRenderer: DocumentRenderer;
}): MeetingNoticeService {
  async function hallFacts() {
    const settings = await hallSettingsService.get();
    return meetingNoticeHallFactsSchema.parse({ name: settings.name, timeZone: settings.timeZone });
  }
  async function withCurrentHall(notices: MeetingNotice[]) {
    const current = await hallFacts();
    return notices.map((notice) => ({ ...notice, isCurrent: notice.isCurrent &&
      notice.facts.hall.name === current.name && notice.facts.hall.timeZone === current.timeZone }));
  }
  return {
    async list(meetingId) { return withCurrentHall(await councilClient.listNotices(meetingId)); },
    async open(id) {
      const notice = await councilClient.openNotice(id);
      if (!notice) throw new DomainError("meeting_notice_not_found", 404);
      return (await withCurrentHall([notice]))[0]!;
    },
    async generate(meetingId) {
      const meeting = await councilClient.noticeFacts(meetingId);
      if (!meeting) throw new DomainError("meeting_notice_unavailable", 409);
      const facts: MeetingNoticeFacts = { meeting, hall: await hallFacts() };
      const content = await documentRenderer.pdf(renderMeetingNotice(facts));
      const notice = await councilClient.generateNotice(meetingId, facts, content);
      return (await withCurrentHall([notice]))[0]!;
    },
    async content(id) {
      const content = await councilClient.noticeContent(id);
      if (!content) throw new DomainError("meeting_notice_not_found", 404);
      return content;
    },
  };
}
