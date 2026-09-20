import type { GenerateEventInvitation } from "@hall/api-contract";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { HallSettingsRepository } from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export interface EventInvitationMessage {
  content: Buffer;
  fileName: string;
  mediaType: "message/rfc822";
}

export interface EventInvitationService {
  generate(reference: string, input: GenerateEventInvitation): Promise<EventInvitationMessage>;
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

// @implements-requirement HALL-FR-CAL-170
// @implements-requirement HALL-FR-CAL-180
// @implements-requirement HALL-FR-CAL-190
export function createEventInvitationService({
  resourcesClient,
  directoryClient,
  hallSettingsRepository,
}: {
  resourcesClient: ResourcesClient;
  directoryClient: DirectoryClient;
  hallSettingsRepository: HallSettingsRepository;
}): EventInvitationService {
  return {
    async generate(reference, input) {
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
        return contact?.email ? [{ name: `${contact.firstName} ${contact.lastName}`, address: contact.email }] : [];
      });
      const recipients = [
        ...new Map(recipientCandidates.map((recipient) => [recipient.address.toLocaleLowerCase(), recipient])).values(),
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
      const cancelling = input.method === "cancel";
      const subject = `${cancelling ? "Annulation" : "Invitation"} : ${opened.data.name}`;
      const composer = new MailComposer({
        headers: { "X-Unsent": "1" },
        from: { name: hall.outboundEmailSenderName || hall.name, address: organizerAddress },
        replyTo: hall.outboundEmailReplyToAddress ?? undefined,
        to: recipients,
        subject,
        text: `${subject}\n\n${opened.data.document.content}`,
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
        fileName: `${safeStem(opened.data.name)}-${input.method}.eml`,
        mediaType: "message/rfc822",
      };
    },
  };
}
