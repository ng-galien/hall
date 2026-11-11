// @implements-requirement HALL-FR-EML-090
import type { GenerateEventInvitation } from "@hall/api-contract";
import type { MailDraft, MailSource } from "@hall/contracts";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { HallSettingsRepository } from "../repositories/contracts.js";
import type { ContentTemplateService, TemplateAttachment } from "./contentTemplateService.js";
import { DomainError } from "./errors.js";

export interface EventInvitationMessage {
  content: Buffer;
  fileName: string;
  mediaType: "message/rfc822";
}

export interface EventInvitationService {
  generate(reference: string, input: GenerateEventInvitation): Promise<EventInvitationMessage>;
  prepareMail(
    reference: string,
    input: GenerateEventInvitation,
  ): Promise<{ draft: MailDraft; files: TemplateAttachment[]; source: MailSource }>;
}

function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function parameter(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "'")
    .replace(/[\r\n]/g, " ");
}

function utc(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function compactDate(value: string): string {
  return value.replace(/-/g, "");
}

function safeStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stem || "rendez-vous";
}

function foldCalendarLine(line: string): string {
  const folded: string[] = [];
  let current = "";
  let limit = 75;
  for (const character of line) {
    if (Buffer.byteLength(current + character, "utf8") > limit) {
      folded.push(current);
      current = ` ${character}`;
      limit = 75;
    } else {
      current += character;
    }
  }
  folded.push(current);
  return folded.join("\r\n");
}

/** Shared human-readable invitation content for generation and template preview. */
export function eventInvitationSource(
  name: string,
  content: string,
  method: GenerateEventInvitation["method"],
): { subject: string; bodyMarkdown: string } {
  const subject = `${method === "cancel" ? "Annulation" : "Invitation"} : ${name}`;
  return { subject, bodyMarkdown: `${subject}\n\n${content}` };
}

// @implements-requirement HALL-FR-CAL-170
// @implements-requirement HALL-FR-CAL-180
// @implements-requirement HALL-FR-CAL-190
export function createEventInvitationService({
  resourcesClient,
  directoryClient,
  hallSettingsRepository,
  contentTemplateService,
}: {
  resourcesClient: ResourcesClient;
  directoryClient: DirectoryClient;
  hallSettingsRepository: HallSettingsRepository;
  contentTemplateService: ContentTemplateService;
}): EventInvitationService {
  async function prepare(reference: string, input: GenerateEventInvitation, includePresentation: boolean) {
    const opened = await resourcesClient.open(reference);
    if (!opened) throw new DomainError("resource_not_found", 404);
    if (opened.data.kind !== "event") throw new DomainError("invalid_request", 400);
    const [hall, contacts] = await Promise.all([hallSettingsRepository.get(), directoryClient.listContacts()]);
    const organizerAddress = hall.outboundEmailSenderAddress ?? hall.email;
    if (!organizerAddress) throw new DomainError("invalid_request", 400);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact] as const));
    const recipientCandidates = opened.data.document.participants.flatMap((participant) => {
      if (participant.kind !== "contact") return [];
      const contact = contactsById.get(participant.contactId);
      return contact
        ? [{ name: `${contact.firstName} ${contact.lastName}`, address: contact.email ?? "", contactId: contact.id }]
        : [];
    });
    const recipients = [
      ...new Map(
        recipientCandidates
          .filter((recipient) => recipient.address)
          .map((recipient) => [recipient.address.toLocaleLowerCase(), recipient]),
      ).values(),
    ];
    const method = input.method === "cancel" ? "CANCEL" : "REQUEST";
    const schedule = opened.data.document.schedule;
    const dateLines =
      schedule.kind === "allDay"
        ? [`DTSTART;VALUE=DATE:${compactDate(schedule.start)}`, `DTEND;VALUE=DATE:${compactDate(schedule.end)}`]
        : [`DTSTART:${utc(schedule.start)}`, `DTEND:${utc(schedule.end)}`];
    const attendeeLines = recipients.map(
      ({ name, address }) => `ATTENDEE;CN="${parameter(name)}";ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${address}`,
    );
    const calendar = [
      "BEGIN:VCALENDAR",
      "PRODID:-//Hall//Calendrier municipal//FR",
      "VERSION:2.0",
      "CALSCALE:GREGORIAN",
      `METHOD:${method}`,
      "BEGIN:VEVENT",
      `UID:hall-event-${opened.data.id}@hall.local`,
      `SEQUENCE:${opened.data.version}`,
      `DTSTAMP:${utc(new Date().toISOString())}`,
      ...dateLines,
      `SUMMARY:${text(opened.data.name)}`,
      `LOCATION:${text(opened.data.document.location)}`,
      `DESCRIPTION:${text(opened.data.document.content)}`,
      `ORGANIZER;CN="${parameter(hall.outboundEmailSenderName || hall.name)}":mailto:${organizerAddress}`,
      ...attendeeLines,
      ...(input.method === "cancel" ? ["STATUS:CANCELLED"] : []),
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]
      .map(foldCalendarLine)
      .join("\r\n");
    const { subject, bodyMarkdown } = eventInvitationSource(
      opened.data.name,
      opened.data.document.content,
      input.method,
    );
    const preview = await contentTemplateService.generatedPreview(
      "event-invitation",
      bodyMarkdown,
      subject,
      {},
      false,
      { event: { id: opened.data.id, name: opened.data.name, ...opened.data.document, method: input.method } },
      includePresentation,
    );
    if (preview.diagnostics.some((item) => item.severity === "error")) throw new DomainError("template_invalid", 422);
    return {
      preview,
      recipients,
      calendar,
      method,
      hall,
      organizerAddress,
      name: opened.data.name,
      resourceId: opened.data.id,
      version: opened.data.version,
      recipientCandidates,
      subject,
    };
  }
  return {
    async prepareMail(reference, input) {
      const prepared = await prepare(reference, input, false);
      return {
        draft: {
          subject: prepared.preview.subject ?? prepared.subject,
          bodyMarkdown: prepared.preview.resolvedMarkdown ?? prepared.preview.text,
          recipients: prepared.recipientCandidates.map((recipient) => ({ ...recipient, kind: "to" })),
        },
        files: [
          {
            id: prepared.resourceId,
            fileName: "invitation.ics",
            mediaType: "text/calendar",
            content: Buffer.from(prepared.calendar, "utf8"),
          },
        ],
        source: { kind: "event", resourceId: prepared.resourceId, version: prepared.version, method: input.method },
      };
    },
    async generate(reference, input) {
      const { preview, recipients, calendar, method, hall, organizerAddress, name, subject } = await prepare(
        reference,
        input,
        true,
      );
      const composer = new MailComposer({
        headers: { "X-Unsent": "1" },
        from: { name: hall.outboundEmailSenderName || hall.name, address: organizerAddress },
        replyTo: hall.outboundEmailReplyToAddress ?? undefined,
        to: recipients,
        subject: preview.subject ?? subject,
        text: preview.text,
        html: preview.html,
        alternatives: [
          {
            filename: "invitation.ics",
            contentType: `text/calendar; charset=utf-8; method=${method}`,
            content: calendar,
            headers: {
              "Content-Disposition": 'attachment; filename="invitation.ics"',
              "Content-Class": "urn:content-classes:calendarmessage",
            },
          },
        ],
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const message = composer.compile();
      return {
        content: await message.build(),
        fileName: `${safeStem(name)}-${input.method}.eml`,
        mediaType: "message/rfc822",
      };
    },
  };
}
