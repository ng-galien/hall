// @verifies-requirement HALL-FR-EML-090
import type { MailMessage, MailPreview } from "@hall/contracts";
import type { Response } from "superagent";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

function binaryParser(response: Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", callback);
}

describe("event invitation HTTP contract", () => {
  it("returns an EML draft from the advertised resource command", async () => {
    const { agent, container } = await createTestServer();
    const current = await container.cradle.hallSettingsRepository.get();
    await container.cradle.hallSettingsRepository.update({
      ...current,
      email: "mairie@example.test",
      outboundEmailSenderName: "Commune témoin",
      outboundEmailSenderAddress: "conseil@example.test",
    });
    const contact = domainBody<{ id: string }>(
      await agent
        .post("/api/contacts")
        .send({ firstName: "Alice", lastName: "Martin", email: "alice@example.test" })
        .expect(201),
    );
    const resource = domainBody<{ id: string }>(
      await agent
        .post("/api/resources")
        .send({
          kind: "event",
          path: "",
          name: "Réunion de voirie",
          document: {
            content: "Préparer le dossier.",
            location: "Salle du conseil",
            schedule: { kind: "timed", start: "2026-09-17T17:30:00.000Z", end: "2026-09-17T18:30:00.000Z" },
            participants: [{ kind: "contact", contactId: contact.id }],
          },
        })
        .expect(201),
    );
    const prepared = domainBody<MailMessage>(
      await agent.post(`/api/resources/${resource.id}/event-invitation`).send({ method: "request" }).expect(201),
    );
    expect(prepared.source).toMatchObject({ kind: "event", resourceId: resource.id, method: "request" });
    expect(prepared.recipients[0]?.address).toBe("alice@example.test");
    expect(prepared.attachments).toHaveLength(1);
    expect(prepared.attachments[0]?.fileName).toBe("invitation.ics");
    const calendar = await agent
      .get(`/api/mail/${prepared.id}/attachments/${prepared.attachments[0]!.id}/content`)
      .expect(200);
    expect(calendar.text).toContain(`hall-event-${resource.id}@hall.local`);
    expect(calendar.text).toContain("METHOD:REQUEST");
    const preview = domainBody<MailPreview>(await agent.get(`/api/mail/${prepared.id}/preview`).expect(200));
    expect(preview.subject).toContain("Réunion de voirie");
    const response = await agent
      .post(`/api/resources/${resource.id}/event-invitation`)
      .set("Accept", "message/rfc822")
      .send({ method: "request" })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(response.headers["content-type"]).toContain("message/rfc822");
    expect(response.headers["content-disposition"]).toContain(".eml");
    const message = (response.body as Buffer).toString("utf8");
    expect(message).toContain("alice@example.test");
    expect(message.match(/Content-Type: text\/calendar/g)).toHaveLength(1);
    expect(message).not.toContain("Content-Type: application/ics");
  });
});
