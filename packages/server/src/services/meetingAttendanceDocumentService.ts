import type { CouncilMeeting, CouncilMember, MeetingAttendance } from "@hall/api-contract";
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
  proxyForm(meetingReference: string, grantorMemberId: string, holderMemberId: string): Promise<Buffer>;
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
/** The sheet lists every member in mandate; attendance and proxies appear once recorded for the meeting. */
export function attendanceSheetData(
  meeting: CouncilMeeting,
  members: readonly MeetingDocumentMember[],
  attendance: readonly MeetingAttendance[],
): AttendanceSheetData {
  const byMember = new Map(attendance.map((entry) => [entry.councilMemberId, entry]));
  const names = new Map(members.map((member) => [member.id, member.name]));
  return {
    meeting: meetingDocumentMeeting(meeting),
    members: members.map((member) => {
      const entry = byMember.get(member.id);
      const holder = entry?.proxyHolderCouncilMemberId ?? null;
      return {
        ...member,
        status: entry?.status ?? null,
        proxyHolder: holder ? { name: names.get(holder) ?? "" } : null,
      };
    }),
    counts: attendance.length
      ? {
          present: attendance.filter((entry) => entry.status === "present").length,
          represented: attendance.filter((entry) => entry.status === "represented").length,
          excused: attendance.filter((entry) => entry.status === "excused").length,
          absent: attendance.filter((entry) => entry.status === "absent").length,
        }
      : null,
  };
}

// @implements-requirement HALL-FR-ATT-180
/** Both members are in mandate and distinct; the form records nothing. */
export function proxyFormData(
  meeting: CouncilMeeting,
  members: readonly MeetingDocumentMember[],
  grantorMemberId: string,
  holderMemberId: string,
): ProxyFormData {
  const grantor = members.find((member) => member.id === grantorMemberId);
  const holder = members.find((member) => member.id === holderMemberId);
  if (!grantor || !holder || grantor.id === holder.id) throw new DomainError("proxy_form_invalid", 422);
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
      const [members, attendance] = await Promise.all([
        membersInMandate(directoryClient),
        councilClient.listAttendance(target.id),
      ]);
      return generate("attendance-sheet", target, {
        attendanceSheet: attendanceSheetData(target, members, attendance),
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
