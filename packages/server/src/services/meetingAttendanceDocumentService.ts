import type { CouncilMeeting, CouncilMember } from "@hall/api-contract";
import type { ContentTemplate } from "@hall/domain";
import type { CouncilClient } from "../clients/councilClient.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { ContentTemplateService } from "./contentTemplateService.js";
import { DomainError } from "./errors.js";
import {
  type AttendanceSheetData,
  councilTableOrder,
  type MeetingDocumentMeeting,
  type MeetingDocumentMember,
  type ProxyFormData,
} from "./templateData.js";

export interface MeetingAttendanceDocumentService {
  attendanceSheet(meetingReference: string): Promise<Buffer>;
  proxyForm(meetingReference: string, grantorMemberId: string, holderMemberId: string | null): Promise<Buffer>;
}

// @implements-requirement HALL-FR-ATT-170
// @implements-requirement HALL-FR-ATT-180
/** The attendance sheet and the proxy form are produced while the meeting is in preparation or in progress. */
export function meetingAttendanceDocumentsAvailable(meeting: { closedAt?: unknown }): boolean {
  return !meeting.closedAt;
}

export function meetingDocumentMeeting(meeting: CouncilMeeting): MeetingDocumentMeeting {
  return { number: meeting.number, startsAt: meeting.startedAt ?? meeting.scheduledAt, location: meeting.location };
}

/** Members in mandate, in council table order, named after their contact. */
export async function membersInMandate(directoryClient: DirectoryClient): Promise<MeetingDocumentMember[]> {
  const [members, contacts] = await Promise.all([
    directoryClient.listCouncilMembers(true),
    directoryClient.listContacts(true),
  ]);
  const names = new Map(contacts.map((contact) => [contact.id, `${contact.firstName} ${contact.lastName}`]));
  const ordered = councilTableOrder(members);
  return ordered.map((member: CouncilMember) => ({
    id: member.id,
    name: names.get(member.contactId) ?? "",
    role: member.role,
  }));
}

// @implements-requirement HALL-FR-ATT-170
/** The sheet names every member in mandate; the members present sign it on arrival. */
export function attendanceSheetData(
  meeting: CouncilMeeting,
  members: readonly MeetingDocumentMember[],
): AttendanceSheetData {
  return { meeting: meetingDocumentMeeting(meeting), members: members.map((member) => ({ name: member.name })) };
}

// @implements-requirement HALL-FR-ATT-180
/** The grantor is a member in mandate; the holder, optional, is another member in mandate. The form records nothing. */
export function proxyFormData(
  meeting: CouncilMeeting,
  members: readonly MeetingDocumentMember[],
  grantorMemberId: string,
  holderMemberId: string | null,
): ProxyFormData {
  const grantor = members.find((member) => member.id === grantorMemberId);
  const holder = holderMemberId === null ? null : members.find((member) => member.id === holderMemberId);
  if (!grantor || holder === undefined || holder?.id === grantor.id) throw new DomainError("proxy_form_invalid", 422);
  return { meeting: meetingDocumentMeeting(meeting), grantor, holder };
}

export function createMeetingAttendanceDocumentService({
  councilClient,
  directoryClient,
  contentTemplateService,
}: {
  councilClient: CouncilClient;
  directoryClient: DirectoryClient;
  contentTemplateService: ContentTemplateService;
}): MeetingAttendanceDocumentService {
  async function template(documentType: "attendance-sheet" | "proxy-form"): Promise<ContentTemplate> {
    const templates = (await contentTemplateService.list()).filter(
      (item) => item.kind === "pdf" && item.documentType === documentType,
    );
    if (templates.length === 0) throw new DomainError("template_not_found", 404);
    if (templates.length !== 1) throw new DomainError("template_invalid", 422);
    return templates[0]!;
  }
  async function meeting(reference: string): Promise<CouncilMeeting> {
    const found = await councilClient.openMeeting(reference);
    if (!found) throw new DomainError("meeting_not_found", 404);
    if (!meetingAttendanceDocumentsAvailable(found)) throw new DomainError("meeting_attendance_documents_closed", 409);
    return found;
  }
  async function generate(
    documentType: "attendance-sheet" | "proxy-form",
    target: CouncilMeeting,
    generatedData: { attendanceSheet: AttendanceSheetData } | { proxy: ProxyFormData },
  ) {
    const generated = await contentTemplateService.generateFromTemplate(await template(documentType), {
      context: { meetingId: target.id },
      generatedData,
      attachmentResourceIds: [],
      to: [],
      cc: [],
      bcc: [],
    });
    return generated.content;
  }
  return {
    async attendanceSheet(reference) {
      const target = await meeting(reference);
      const members = await membersInMandate(directoryClient);
      return generate("attendance-sheet", target, {
        attendanceSheet: attendanceSheetData(target, members),
      });
    },
    async proxyForm(reference, grantorMemberId, holderMemberId) {
      const target = await meeting(reference);
      const members = await membersInMandate(directoryClient);
      return generate("proxy-form", target, {
        proxy: proxyFormData(target, members, grantorMemberId, holderMemberId),
      });
    },
  };
}
