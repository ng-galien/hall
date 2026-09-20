import { resourceChangesSchema } from "@hall/api-contract";
import request from "supertest";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createPostgresHttpTestServer, domainBody } from "./testServer.js";

const postgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

postgres("text resource changes", () => {
  // @verifies-requirement HALL-FR-DOC-280
  it("exposes only committed last change for a text resource through its Siren link", async () => {
    const { agent, url } = await createPostgresHttpTestServer();
    const created = await agent
      .post("/api/resources")
      .send({ kind: "text", path: "", name: "Live note", content: "Initial" })
      .expect(201);
    const resource = domainBody<{ id: string; version: number }>(created);
    const changesLink = (created.body.links as Array<{ rel: string[]; href: string }>).find((link) =>
      link.rel.includes("changes"),
    );
    expect(changesLink?.href).toBe(`/api/resources/${created.body.properties.slug}/changes`);
    expect(resourceChangesSchema.parse(domainBody(await agent.get(changesLink!.href).expect(200)))).toEqual({
      resourceId: resource.id,
      changes: [],
    });

    const reader = request.agent(url);
    const socket = new WebSocket(`${url.replace(/^http/, "ws")}/api/live?kind=resource&id=${resource.id}`, {
      headers: { Origin: url },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
      });
      const notification = new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Expected a resource change notification")), 2000);
        socket.once("message", (data) => {
          clearTimeout(timeout);
          resolve(JSON.parse(data.toString()));
        });
      });
      await agent
        .put(`/api/resources/${resource.id}/content`)
        .send({ kind: "text", expectedVersion: resource.version, content: "Saved" })
        .expect(200);
      await expect(notification).resolves.toMatchObject({
        type: "resource.changed",
        resourceId: resource.id,
        actor: { id: expect.any(String), displayName: expect.any(String) },
      });
    } finally {
      socket.terminate();
    }
    await agent
      .put(`/api/resources/${resource.id}/content`)
      .send({ kind: "text", expectedVersion: resource.version, content: "Rejected stale update" })
      .expect(409);

    const projected = resourceChangesSchema.parse(domainBody(await reader.get(changesLink!.href).expect(200)));
    expect(projected.resourceId).toBe(resource.id);
    expect(projected.changes).toHaveLength(1);
    expect(projected.changes[0]).toMatchObject({ kind: "content", fields: ["content"] });
    expect(projected.changes[0].actor.id).toBeTruthy();
    expect(projected.changes[0].actor.displayName).toBeTruthy();
    expect(Date.parse(projected.changes[0].occurredAt)).not.toBeNaN();
  });
});
