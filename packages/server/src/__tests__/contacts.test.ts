import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("contacts", () => {
  it("keeps contact identity independent from a council mandate", async () => {
    const { agent } = await createTestServer();
    const contactResponse = await agent
      .post("/api/contacts")
      .send({
        firstName: "Alice",
        lastName: "Martin",
        organizationName: "Commune de Saint-Aubin",
        jobTitle: "Conseillère municipale",
        email: "alice.martin@example.fr",
        phone: "+33 6 12 34 56 78",
        notes: "Contact de démonstration",
      })
      .expect(201);
    const contact = domainBody<{ id: string; archivedAt: string | null }>(contactResponse);
    expect(contact.archivedAt).toBeNull();
    expect(contactResponse.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "contact.update", method: "PUT" }),
        expect.objectContaining({ name: "contact.archive", method: "POST" }),
      ]),
    );

    const member = domainBody<{
      id: string;
      contact: { id: string; firstName: string; email: string | null };
      active: boolean;
    }>(
      await agent
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    expect(member).toMatchObject({
      contact: { id: contact.id, firstName: "Alice", email: "alice.martin@example.fr" },
      active: true,
    });

    const contactWithActiveMandate = await agent.get(`/api/contacts/${contact.id}`).expect(200);
    expect(contactWithActiveMandate.body.actions ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "contact.archive" })]),
    );

    await agent
      .post("/api/council-members")
      .send({ contactId: contact.id, role: "councillor", termStartedOn: "2026-04-01" })
      .expect(409);
    const archiveConflict = await agent.post(`/api/contacts/${contact.id}/archive`).expect(409);
    expect(archiveConflict.body.code).toBe("contact_has_active_council_membership");

    await agent
      .put(`/api/council-members/${member.id}`)
      .send({ role: "councillor", termStartedOn: "2026-03-22", termEndedOn: "2026-08-31" })
      .expect(200);
    const contactWithoutActiveMandate = await agent.get(`/api/contacts/${contact.id}`).expect(200);
    expect(contactWithoutActiveMandate.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "contact.archive", method: "POST" })]),
    );
    const archived = domainBody<{ archivedAt: string | null }>(
      await agent.post(`/api/contacts/${contact.id}/archive`).expect(200),
    );
    expect(archived.archivedAt).not.toBeNull();
    expect(domainBody<unknown[]>(await agent.get("/api/contacts").expect(200))).toEqual([]);

    const reopenArchivedContact = await agent
      .put(`/api/council-members/${member.id}`)
      .send({ role: "councillor", termStartedOn: "2026-03-22", termEndedOn: null })
      .expect(409);
    expect(reopenArchivedContact.body.code).toBe("contact_archived");
  });

  it("rejects reopening an old mandate when the contact already has an active mandate", async () => {
    const { agent } = await createTestServer();
    const contact = domainBody<{ id: string }>(
      await agent.post("/api/contacts").send({ firstName: "Nadia", lastName: "Renard" }).expect(201),
    );
    const oldMember = domainBody<{ id: string }>(
      await agent
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "councillor", termStartedOn: "2020-03-15" })
        .expect(201),
    );
    await agent
      .put(`/api/council-members/${oldMember.id}`)
      .send({ role: "councillor", termStartedOn: "2020-03-15", termEndedOn: "2026-03-21" })
      .expect(200);
    await agent
      .post("/api/council-members")
      .send({ contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" })
      .expect(201);

    const conflict = await agent
      .put(`/api/council-members/${oldMember.id}`)
      .send({ role: "councillor", termStartedOn: "2020-03-15", termEndedOn: null })
      .expect(409);
    expect(conflict.body.code).toBe("contact_already_active_council_member");
  });

  it("refuses to exceed the council term member count", async () => {
    const { agent } = await createTestServer({ expectedCouncilMemberCount: 1 });
    const contacts = await Promise.all(
      ["Lina", "Marc"].map(async (firstName) =>
        domainBody<{ id: string }>(
          await agent.post("/api/contacts").send({ firstName, lastName: "Petit" }).expect(201),
        ),
      ),
    );
    await agent
      .post("/api/council-members")
      .send({ contactId: contacts[0].id, role: "mayor", termStartedOn: "2026-03-22" })
      .expect(201);
    const fullCollection = await agent.get("/api/council-members").expect(200);
    expect(fullCollection.body.actions ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "member.create" })]),
    );

    const overflow = await agent
      .post("/api/council-members")
      .send({ contactId: contacts[1].id, role: "councillor", termStartedOn: "2026-03-22" })
      .expect(409);
    expect(overflow.body.code).toBe("council_term_capacity_reached");

    const activeMember = domainBody<Array<{ id: string }>>(fullCollection)[0];
    await agent
      .put(`/api/council-members/${activeMember.id}`)
      .send({ role: "mayor", termStartedOn: "2026-03-22", termEndedOn: "2026-08-31" })
      .expect(200);
    expect((await agent.get("/api/council-members").expect(200)).body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "member.create" })]),
    );
  });

  it("requires the active council term member count before creating a mandate", async () => {
    const { agent } = await createTestServer({ expectedCouncilMemberCount: null });
    const contact = domainBody<{ id: string }>(
      await agent.post("/api/contacts").send({ firstName: "Lou", lastName: "Brun" }).expect(201),
    );

    const response = await agent
      .post("/api/council-members")
      .send({ contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" })
      .expect(409);
    expect(response.body.code).toBe("council_term_not_configured");
    expect((await agent.get("/api/council-members").expect(200)).body.actions ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "member.create" })]),
    );
  });

  it("refuses to reopen an old mandate when the active council term is full", async () => {
    const { agent } = await createTestServer({ expectedCouncilMemberCount: 1 });
    const contacts = await Promise.all(
      ["Inès", "Paul"].map(async (firstName) =>
        domainBody<{ id: string }>(
          await agent.post("/api/contacts").send({ firstName, lastName: "Colin" }).expect(201),
        ),
      ),
    );
    const oldMember = domainBody<{ id: string }>(
      await agent
        .post("/api/council-members")
        .send({ contactId: contacts[0].id, role: "councillor", termStartedOn: "2020-03-15" })
        .expect(201),
    );
    await agent
      .put(`/api/council-members/${oldMember.id}`)
      .send({ role: "councillor", termStartedOn: "2020-03-15", termEndedOn: "2026-03-21" })
      .expect(200);
    await agent
      .post("/api/council-members")
      .send({ contactId: contacts[1].id, role: "mayor", termStartedOn: "2026-03-22" })
      .expect(201);

    const response = await agent
      .put(`/api/council-members/${oldMember.id}`)
      .send({ role: "councillor", termStartedOn: "2020-03-15", termEndedOn: null })
      .expect(409);
    expect(response.body.code).toBe("council_term_capacity_reached");
  });

  it("keeps the council term capacity as a database invariant", async () => {
    const { container } = await createTestServer({ expectedCouncilMemberCount: 1 });
    const contacts = await Promise.all(
      ["Eva", "Noé"].map((firstName) =>
        container.cradle.contactRepository.create({
          firstName,
          lastName: "Robert",
          organizationName: null,
          jobTitle: null,
          email: null,
          phone: null,
          notes: "",
        }),
      ),
    );
    const oldMember = await container.cradle.councilMemberRepository.create({
      contactId: contacts[0].id,
      role: "mayor",
      termStartedOn: "2026-03-22",
    });
    await container.cradle.councilMemberRepository.update(oldMember.id, {
      role: "mayor",
      termStartedOn: "2026-03-22",
      termEndedOn: "2026-08-31",
    });
    await container.cradle.councilMemberRepository.create({
      contactId: contacts[1].id,
      role: "councillor",
      termStartedOn: "2026-03-22",
    });

    await expect(
      container.cradle.councilMemberRepository.update(oldMember.id, {
        role: "mayor",
        termStartedOn: "2026-03-22",
        termEndedOn: null,
      }),
    ).rejects.toMatchObject({ constraint: "council_term_capacity_reached" });
  });

  it("resolves contact and member snippets through the current contact identity", async () => {
    const { agent } = await createTestServer();
    const contact = domainBody<{ id: string }>(
      await agent.post("/api/contacts").send({ firstName: "Camille", lastName: "Durand" }).expect(201),
    );
    const member = domainBody<{ id: string }>(
      await agent
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "mayor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    await agent
      .put(`/api/contacts/${contact.id}`)
      .send({
        firstName: "Camille",
        lastName: "Roy",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      })
      .expect(200);

    const preview = domainBody<{ html: string; diagnostics: unknown[] }>(
      await agent
        .post("/api/templates/preview")
        .send({
          kind: "pdf",
          bodyMarkdown: `:member[ancien membre]{#${member.id}} · :contact[ancien contact]{#${contact.id}}`,
          context: {},
        })
        .expect(200),
    );
    expect(preview.html.match(/Camille Roy/g)).toHaveLength(2);
    expect(preview.html).not.toContain("ancien");
    expect(preview.diagnostics).toEqual([]);
  });
});
