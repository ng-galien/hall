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
      await agent.post("/api/contacts").send({ firstName: "Alice", lastName: "Martin", email: "alice@example.test" }).expect(201),
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
    const response = await agent
      .post(`/api/resources/${resource.id}/event-invitation`)
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
