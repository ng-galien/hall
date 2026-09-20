import type { MeetingNoticeMessagePreparation } from "@hall/contracts";
import { type MeetingNotice, type MeetingNoticeFacts, meetingNoticeHallFactsSchema } from "@hall/contracts";
import type { ContentTemplate } from "@hall/domain";
import { collectDirectives, parse } from "@hall/templating";
import type { CouncilClient } from "../clients/councilClient.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { ContentTemplateService, GeneratedFile } from "./contentTemplateService.js";
import { DomainError } from "./errors.js";
import type { HallSettingsService } from "./hallSettingsService.js";

export interface MeetingNoticeService {
  messagePreparation(meetingId: string): Promise<MeetingNoticeMessagePreparation>;
  generateMessage(meetingId: string, noticeId: string): Promise<GeneratedFile>;
  list(meetingId: string): Promise<MeetingNotice[]>;
  open(id: string): Promise<MeetingNotice>;
  generate(meetingId: string): Promise<MeetingNotice>;
  content(id: string): Promise<Buffer>;
}
export function createMeetingNoticeService({
  councilClient,
  hallSettingsService,
  contentTemplateService,
  directoryClient,
}: {
  directoryClient: DirectoryClient;
  councilClient: CouncilClient;
  hallSettingsService: HallSettingsService;
  contentTemplateService: ContentTemplateService;
}): MeetingNoticeService {
  async function template(
    kind: ContentTemplate["kind"] = "pdf",
    documentType = "meeting-notice",
  ): Promise<ContentTemplate> {
    const templates = (await contentTemplateService.list()).filter(
      (item) => item.kind === kind && item.documentType === documentType,
    );
    if (templates.length === 0) throw new DomainError("template_not_found", 404);
    if (templates.length !== 1) throw new DomainError("template_invalid", 422);
    const selected = templates[0]!;
    if (
      collectDirectives(parse(selected.bodyMarkdown)).filter((entry) => entry.name === "meeting-notice").length !== 1
    ) {
      throw new DomainError("template_invalid", 422);
    }
    return selected;
  }
  async function messagePreparation(meetingId: string): Promise<MeetingNoticeMessagePreparation> {
    const [meeting, members, contacts] = await Promise.all([
      councilClient.openMeeting(meetingId),
      directoryClient.listCouncilMembers(true),
      directoryClient.listContacts(true),
    ]);
    if (!meeting) throw new DomainError("meeting_not_found", 404);
    const recipients = members.map((member) => {
      const contact = contacts.find((entry) => entry.id === member.contactId);
      if (!contact) throw new DomainError("contact_not_found", 404);
      return {
        councilMemberId: member.id,
        contactId: contact.id,
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
      };
    });
    const missingEmailMemberIds = recipients
      .filter((recipient) => !recipient.email)
      .map((recipient) => recipient.councilMemberId);
    return {
      councilMeetingId: meetingId,
      noticeId: meeting.currentNoticeId,
      recipients,
      missingEmailMemberIds,
      canGenerate:
        !meeting.startedAt && !!meeting.currentNoticeId && recipients.length > 0 && missingEmailMemberIds.length === 0,
    };
  }
  return {
    messagePreparation,
    async generateMessage(meetingId, noticeId) {
      const preparation = await messagePreparation(meetingId);
      if (preparation.noticeId !== noticeId) throw new DomainError("meeting_notice_stale", 409);
      if (preparation.missingEmailMemberIds.length > 0 || preparation.recipients.length === 0)
        throw new DomainError("meeting_notice_recipients_incomplete", 409);
      if (!preparation.canGenerate) throw new DomainError("meeting_notice_unavailable", 409);
      const notice = await councilClient.openNotice(noticeId);
      if (!notice?.isCurrent || notice.councilMeetingId !== meetingId)
        throw new DomainError("meeting_notice_stale", 409);
      const content = await councilClient.noticeContent(noticeId);
      if (!content) throw new DomainError("meeting_notice_not_found", 404);
      const message = await contentTemplateService.generateFromTemplate(
        await template("message", "meeting-notice-message"),
        {
          context: { meetingId },
          meetingNoticeFacts: notice.facts,
          attachmentResourceIds: [],
          attachmentFiles: [
            {
              id: notice.id,
              fileName: `convocation-${notice.facts.meeting.number}-v${notice.version}.pdf`,
              mediaType: "application/pdf",
              content,
            },
          ],
          to: [
            ...new Set(
              preparation.recipients
                .map((recipient) => recipient.email)
                .filter((email): email is string => email !== null),
            ),
          ],
          cc: [],
          bcc: [],
        },
      );
      if ((await councilClient.openMeeting(meetingId))?.currentNoticeId !== noticeId)
        throw new DomainError("meeting_notice_stale", 409);
      return message;
    },
    list: (meetingId) => councilClient.listNotices(meetingId),
    async open(id) {
      const notice = await councilClient.openNotice(id);
      if (!notice) throw new DomainError("meeting_notice_not_found", 404);
      return notice;
    },
    async generate(meetingId) {
      const meeting = await councilClient.noticeFacts(meetingId);
      if (!meeting) throw new DomainError("meeting_notice_unavailable", 409);
      const settings = await hallSettingsService.get();
      const facts: MeetingNoticeFacts = {
        issuedOn: new Intl.DateTimeFormat("en-CA", {
          timeZone: settings.timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
        meeting,
        hall: meetingNoticeHallFactsSchema.parse({ name: settings.name, timeZone: settings.timeZone }),
      };
      const generated = await contentTemplateService.generateFromTemplate(await template(), {
        context: { meetingId },
        meetingNoticeFacts: facts,
        attachmentResourceIds: [],
        to: [],
        cc: [],
        bcc: [],
      });
      return councilClient.generateNotice(meetingId, facts, generated.content);
    },
    async content(id) {
      const content = await councilClient.noticeContent(id);
      if (!content) throw new DomainError("meeting_notice_not_found", 404);
      return content;
    },
  };
}
