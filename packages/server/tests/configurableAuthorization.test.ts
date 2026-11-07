import type { AuthorizationConfiguration, AuthorizationRole } from "@hall/api-contract";
import { PostgresSchemaBootstrap } from "@hall/postgres";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, domainBody } from "../src/__tests__/testServer.js";

const password = "Authorization-test-2026!";
// @verifies-requirement HALL-FR-USR-060
describe("configurable authorization through HTTP", () => {
  it("applies persisted grants to existing sessions, protects the administrator and follows role links", async () => {
    const { agent: admin, pool, url } = await createPostgresHttpTestServer({ devAutoLogin: false });
    const administrator = domainBody<{ id: string }>(
      await admin
        .post("/api/auth/bootstrap")
        .send({ email: "admin@example.test", displayName: "Admin", password })
        .expect(201),
    );
    const configuration = domainBody<AuthorizationConfiguration>(await admin.get("/api/roles").expect(200));
    expect(configuration.roles.map((role) => role.id).sort()).toEqual([
      "administrator",
      "clerk",
      "contributor",
      "councillor",
    ]);
    const custom = domainBody<AuthorizationRole>(
      await admin
        .post("/api/roles")
        .send({ name: "Reader", revision: 0, grants: [{ access: "read", condition: "always" }] })
        .expect(201),
    );
    const item = await admin.get(`/api/roles/${custom.id}`).expect(200);
    expect(item.body.properties.name).toBe("Reader");
    const user = domainBody<{ id: string }>(
      await admin
        .post("/api/users")
        .send({ email: "reader@example.test", displayName: "Reader", password, roles: [custom.id], contactId: null })
        .expect(201),
    );
    const reader = request.agent(url);
    await reader.post("/api/auth/login").send({ email: "reader@example.test", password }).expect(200);
    await reader.get("/api/contacts").expect(200);
    await reader.get("/api/roles").expect(403);
    await reader.get("/api/roles/options").expect(200);
    const document = domainBody<{ id: string }>(
      await admin
        .post("/api/resources/documents")
        .field("path", "")
        .attach("file", Buffer.from("Preserved export"), { filename: "sample.txt", contentType: "text/plain" })
        .expect(201),
    );
    await reader.get(`/api/resources/${document.id}/preview`).expect(200);
    await reader.get(`/api/resources/${document.id}/content`).expect(403);
    await reader.get(`/api/resources/binary-references/${document.id}/content`).expect(403);
    const exportRole = domainBody<AuthorizationRole>(
      await admin
        .put(`/api/roles/${custom.id}`)
        .send({
          name: "Reader",
          revision: custom.revision,
          grants: [
            { access: "read", condition: "always" },
            { access: "export", condition: "always" },
          ],
        })
        .expect(200),
    );
    expect((await reader.get(`/api/resources/${document.id}/content`).expect(200)).text).toBe("Preserved export");
    await admin.delete(`/api/roles/${custom.id}`).send({ revision: exportRole.revision }).expect(409);
    await reader.get(`/api/resources/binary-references/${document.id}/content`).expect(200);
    const updated = domainBody<AuthorizationRole>(
      await admin
        .put(`/api/roles/${custom.id}`)
        .send({ name: "No reading", revision: exportRole.revision, grants: [] })
        .expect(200),
    );
    await reader.get("/api/contacts").expect(403);
    await reader.get("/api/resources").expect(403);
    const root = await reader.get("/api").expect(200);
    expect(root.body.links.some((link: { rel: string[] }) => link.rel.includes("contacts"))).toBe(false);
    await admin.get("/api/contacts").expect(200);
    await admin.put("/api/roles/administrator").send({ name: "No admin", revision: 1, grants: [] }).expect(409);
    await admin.delete("/api/roles/administrator").send({ revision: 1 }).expect(409);
    await admin.post(`/api/users/${administrator.id}/revoke-access`).send({}).expect(409);
    await admin
      .put(`/api/users/${administrator.id}/roles`)
      .send({ roles: ["contributor"] })
      .expect(409);
    await new PostgresSchemaBootstrap(pool).install();
    expect(domainBody<AuthorizationRole>(await admin.get(`/api/roles/${custom.id}`).expect(200))).toEqual(updated);
    await admin
      .put(`/api/roles/${custom.id}`)
      .send({ name: "Stale", revision: custom.revision, grants: [] })
      .expect(409);
    await admin
      .put(`/api/users/${user.id}/roles`)
      .send({ roles: ["contributor"] })
      .expect(200);
    await reader.get("/api/contacts").expect(200);
    await admin.delete(`/api/roles/${custom.id}`).send({ revision: updated.revision }).expect(204);
  });

  it("provisions custom contextual roles and applies an edited ownership condition", async () => {
    const { agent: admin, url } = await createPostgresHttpTestServer({ devAutoLogin: false });
    await admin
      .post("/api/auth/bootstrap")
      .send({ email: "admin@example.test", displayName: "Admin", password })
      .expect(201);
    await admin.put("/api/council-terms").send({ expectedMemberCount: 3 }).expect(200);
    const member = async (firstName: string) => {
      const contact = domainBody<{ id: string }>(
        await admin.post("/api/contacts").send({ firstName, lastName: "Martin" }).expect(201),
      );
      await admin
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" })
        .expect(201);
      return contact.id;
    };
    const alice = await member("Alice");
    const bob = await member("Bob");
    const role = domainBody<AuthorizationRole>(
      await admin
        .post("/api/roles")
        .send({
          name: "Personal writing",
          revision: 0,
          grants: [
            { access: "read", condition: "always" },
            { access: "personal-resource.write", condition: "ownPersonalWorkspace" },
          ],
        })
        .expect(201),
    );
    for (const [name, contactId] of [
      ["alice", alice],
      ["bob", bob],
    ])
      await admin
        .post("/api/users")
        .send({ email: `${name}@example.test`, displayName: name, password, roles: [role.id], contactId })
        .expect(201);
    const user = request.agent(url);
    await user.post("/api/auth/login").send({ email: "alice@example.test", password }).expect(200);
    const createText = (path: string, name: string) =>
      user.post("/api/resources").send({ kind: "text", path, name, content: "" });
    await createText("Espaces personnels/Alice Martin", "Own draft").expect(201);
    await createText("Espaces personnels/Bob Martin", "Denied draft").expect(403);
    await admin
      .put(`/api/roles/${role.id}`)
      .send({
        name: role.name,
        revision: role.revision,
        grants: [
          { access: "read", condition: "always" },
          { access: "personal-resource.write", condition: "always" },
        ],
      })
      .expect(200);
    await createText("Espaces personnels/Bob Martin", "Shared draft").expect(201);
  });

  it("serializes concurrent removals so one active administrator remains", async () => {
    const { agent: admin, pool } = await createPostgresHttpTestServer({ devAutoLogin: false });
    const first = domainBody<{ id: string }>(
      await admin
        .post("/api/auth/bootstrap")
        .send({ email: "first@example.test", displayName: "First", password })
        .expect(201),
    );
    const second = domainBody<{ id: string }>(
      await admin
        .post("/api/users")
        .send({
          email: "second@example.test",
          displayName: "Second",
          password,
          roles: ["administrator"],
          contactId: null,
        })
        .expect(201),
    );
    const responses = await Promise.all(
      [first, second].map((user) => admin.put(`/api/users/${user.id}/roles`).send({ roles: ["contributor"] })),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const count = await pool.query(
      "SELECT count(*)::int AS count FROM hall.app_user u JOIN hall.app_user_role r ON r.user_id=u.id WHERE u.status='active' AND r.role='administrator'",
    );
    expect(count.rows[0].count).toBe(1);
  });
});
