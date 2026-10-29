if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required; use the isolated test:postgres entry point");

import { resourceChangesSchema } from "@hall/api-contract";
import request from "supertest";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createPostgresHttpTestServer, createTestMandateContact, domainBody } from "./testServer.js";

const postgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

postgres("resource change chronology", () => {
  // @verifies-requirement HALL-FR-DOC-280
  it("exposes all committed changes for a text resource through its Siren link", async () => {
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
      changes: [expect.objectContaining({ kind: "creation" })],
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
    expect(projected.changes).toHaveLength(2);
    expect(projected.changes[0]).toMatchObject({ kind: "content", fields: ["content"] });
    expect(projected.changes[0].actor?.id).toBeTruthy();
    expect(projected.changes[0].actor?.displayName).toBeTruthy();
    expect(Date.parse(projected.changes[0].occurredAt)).not.toBeNaN();
  });
  // @verifies-requirement HALL-FR-DOC-280
  it("retains repeated non-text changes and restricts history through authenticated read rights", async () => {
    const { agent, url } = await createPostgresHttpTestServer({ devAutoLogin: false });
    const admin = {
      email: "audit-admin@example.fr",
      displayName: "Audit Admin",
      password: "Audit-test-password-2026!",
    };
    await agent.post("/api/auth/bootstrap").send(admin).expect(201);
    await agent.post("/api/auth/login").send(admin).expect(200);
    const created = await agent
      .post("/api/resources")
      .send({ kind: "remote", path: "", name: "Tracked link", target: { kind: "unconfigured" } })
      .expect(201);
    const resource = domainBody<{ id: string; version: number }>(created);
    const link = created.body.links.find((entry: { rel: string[] }) => entry.rel.includes("changes")).href;
    const first = await agent
      .put(`/api/resources/${resource.id}/content`)
      .send({
        kind: "remote",
        expectedVersion: resource.version,
        target: { kind: "url", url: "https://example.org/first" },
      })
      .expect(200);
    await agent
      .put(`/api/resources/${resource.id}/content`)
      .send({
        kind: "remote",
        expectedVersion: domainBody<{ version: number }>(first).version,
        target: { kind: "url", url: "https://example.org/second" },
      })
      .expect(200);
    const history = resourceChangesSchema.parse(domainBody(await agent.get(link).expect(200)));
    expect(history.changes).toHaveLength(3);
    expect(new Set(history.changes.map((change) => change.id)).size).toBe(3);
    expect(history.changes.slice(0, 2)).toEqual([
      expect.objectContaining({
        kind: "content",
        fields: ["content"],
        actor: expect.objectContaining({ displayName: "Audit Admin" }),
      }),
      expect.objectContaining({ kind: "content", fields: ["content"] }),
    ]);
    const readerCredentials = { email: "audit-reader@example.fr", password: "Audit-reader-password-2026!" };
    await agent
      .post("/api/users")
      .send({
        ...readerCredentials,
        displayName: "Reader",
        roles: ["councillor"],
        contactId: await createTestMandateContact(agent),
      })
      .expect(201);
    const reader = request.agent(url);
    await reader.get(link).expect(401);
    await reader.post("/api/auth/login").send(readerCredentials).expect(200);
    await reader.get(link).expect(200);
    await reader
      .put(`/api/resources/${resource.id}/content`)
      .send({ kind: "remote", expectedVersion: 3, target: { kind: "unconfigured" } })
      .expect(403);
    expect(resourceChangesSchema.parse(domainBody(await reader.get(link).expect(200))).changes).toHaveLength(3);
    await reader.get("/api/audit-events").expect(403);
  });
});
