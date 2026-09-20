import type { HallSettings } from "@hall/domain";
import { describe, expect, it } from "vitest";
import { createTestDirectoryClient } from "../__tests__/support/directoryClient.js";
import { createTestResourcesClient } from "../__tests__/support/resourcesClient.js";
import type { HallSettingsRepository } from "../repositories/contracts.js";
import { createEventInvitationService } from "./eventInvitationService.js";

const hall: HallSettings = {
  name: "Commune témoin",
  inseeCode: null,
  siren: null,
  population: 1000,
  populationReferenceDate: null,
  addressLine1: "1 place de la Mairie",
  addressLine2: "",
  postalCode: "00000",
  city: "Commune témoin",
  geographicPosition: null,
  phone: "",
  email: "mairie@example.test",
  website: null,
  meetingLocations: ["Salle du conseil"],
  timeZone: "Europe/Paris",
  outboundEmailSenderName: "Conseil municipal",
  outboundEmailSenderAddress: "conseil@example.test",
  outboundEmailReplyToAddress: "secretariat@example.test",
  updatedAt: null,
};

// @verifies-requirement HALL-FR-CAL-170
// @verifies-requirement HALL-FR-CAL-180
// @verifies-requirement HALL-FR-CAL-190
describe("event calendar invitation", () => {
  it("produces update and cancellation EML messages for the same occurrence", async () => {
    const resourcesClient = createTestResourcesClient();
    const directoryClient = createTestDirectoryClient();
    const recipient = await directoryClient.createContact({
      firstName: "Alice",
      lastName: "Martin",
      organizationName: null,
      jobTitle: null,
      email: "alice@example.test",
      phone: null,
      notes: "",
    });
    const withoutEmail = await directoryClient.createContact({
      firstName: "Bruno",
      lastName: "Durand",
      organizationName: null,
      jobTitle: null,
      email: null,
      phone: null,
      notes: "",
    });
    const created = await resourcesClient.create({
      kind: "event",
      path: "",
      name: "Réunion de voirie",
      document: {
        content: "Préparer le dossier.",
        location: "Salle du conseil",
        schedule: { kind: "timed", start: "2026-09-17T17:30:00.000Z", end: "2026-09-17T18:30:00.000Z" },
        participants: [
          { kind: "contact", contactId: recipient.id },
          { kind: "contact", contactId: withoutEmail.id },
          { kind: "guest", name: "Invité libre" },
        ],
      },
    });
    const service = createEventInvitationService({
      resourcesClient,
      directoryClient,
      hallSettingsRepository: { get: async () => hall } as HallSettingsRepository,
    });
    const request = await service.generate(created.data.id, { method: "request" });
    const cancellation = await service.generate(created.data.id, { method: "cancel" });
    const requestText = request.content.toString("utf8");
    const cancellationText = cancellation.content.toString("utf8");

    expect(request.mediaType).toBe("message/rfc822");
    expect(requestText).toContain("alice@example.test");
    expect(requestText).not.toContain("Bruno Durand <>");
    expect(requestText).toContain("method=REQUEST");
    expect(cancellationText).toContain("method=CANCEL");
    expect(requestText.match(/Content-Type: text\/calendar/g)).toHaveLength(1);
    expect(requestText).not.toContain("Content-Type: application/ics");
    expect(cancellationText.match(/Content-Type: text\/calendar/g)).toHaveLength(1);
    expect(cancellationText).not.toContain("Content-Type: application/ics");
    expect(requestText).toContain("ORGANIZER");
    expect(requestText).toContain("DTSTART:20260917T173000Z");
    expect(requestText).toContain("DTEND:20260917T183000Z");
    expect(requestText).toContain("SUMMARY:");
    expect(requestText).toContain("LOCATION:Salle du conseil");
    expect(requestText).toContain("DESCRIPTION:");
    expect(requestText).toContain(`hall-event-${created.data.id}@hall.local`);
    expect(cancellationText).toContain(`hall-event-${created.data.id}@hall.local`);
    expect(cancellationText).toContain("STATUS:CANCELLED");
  });
});
