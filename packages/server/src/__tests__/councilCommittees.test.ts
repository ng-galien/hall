import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("council committees", () => {
  it("manages dated committee memberships", async () => {
    const { agent } = await createTestServer();
    const contactResponse = await agent
      .post("/api/contacts")
      .send({ firstName: "Alice", lastName: "Martin", phone: "+33 6 12 34 56 78" })
      .expect(201);
    const contact = domainBody<{ id: string }>(contactResponse);
    const memberResponse = await agent
      .post("/api/council-members")
      .send({
        contactId: contact.id,
        role: "councillor",
        termStartedOn: "2026-03-22",
      })
      .expect(201);
    const member = domainBody<{ id: string }>(memberResponse);
    expect(memberResponse.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "member.update", method: "PUT" })]),
    );
    const updatedMember = domainBody<{
      active: boolean;
      termEndedOn: string | null;
    }>(
      await agent
        .put(`/api/council-members/${member.id}`)
        .send({
          role: "councillor",
          termStartedOn: "2026-03-22",
          termEndedOn: null,
        })
        .expect(200),
    );
    expect(updatedMember).toMatchObject({
      active: true,
      termEndedOn: null,
    });
    const committee = domainBody<{ id: string }>(
      await agent
        .post("/api/council-committees")
        .send({ name: "Commission vie associative", description: "Prépare les dossiers associatifs." })
        .expect(201),
    );
    const membership = domainBody<{ id: string; endedOn: string | null }>(
      await agent
        .post(`/api/council-committees/${committee.id}/memberships`)
        .send({ councilMemberId: member.id, role: "chair", startedOn: "2026-03-22" })
        .expect(201),
    );
    expect(membership.endedOn).toBeNull();
    const membershipDetails = await agent
      .get(`/api/council-committees/${committee.id}/memberships/${membership.id}`)
      .expect(200);
    expect(membershipDetails.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "committee.update-membership", method: "PUT" }),
        expect.objectContaining({ name: "committee.end-membership", method: "POST" }),
      ]),
    );
    expect(domainBody<{ id: string }>(membershipDetails).id).toBe(membership.id);

    const updatedMembership = domainBody<{ role: string; startedOn: string; endedOn: string | null }>(
      await agent
        .put(`/api/council-committees/${committee.id}/memberships/${membership.id}`)
        .send({ role: "viceChair", startedOn: "2026-03-23", endedOn: null })
        .expect(200),
    );
    expect(updatedMembership).toMatchObject({ role: "viceChair", startedOn: "2026-03-23", endedOn: null });

    const ended = domainBody<{ endedOn: string | null }>(
      await agent
        .post(`/api/council-committees/${committee.id}/memberships/${membership.id}/end`)
        .send({ endedOn: "2026-12-31" })
        .expect(200),
    );
    expect(ended.endedOn).toBe("2026-12-31");

    await agent
      .put(`/api/council-committees/${committee.id}/memberships/${membership.id}`)
      .send({ role: "member", startedOn: "2027-01-01", endedOn: "2026-12-31" })
      .expect(400);

    const memberships = domainBody<Array<{ id: string; endedOn: string | null }>>(
      await agent.get(`/api/council-committees/${committee.id}/memberships`).expect(200),
    );
    expect(memberships).toEqual([expect.objectContaining({ id: membership.id, endedOn: "2026-12-31" })]);
  });

  it("archives a committee without inventing a lifecycle", async () => {
    const { agent } = await createTestServer();
    const committee = domainBody<{ id: string }>(
      await agent.post("/api/council-committees").send({ name: "Commission finances", description: "" }).expect(201),
    );
    const archived = domainBody<{ archivedAt: string | null }>(
      await agent.post(`/api/council-committees/${committee.id}/archive`).expect(200),
    );
    expect(archived.archivedAt).toBeTruthy();
    expect(domainBody(await agent.get("/api/council-committees").expect(200))).toEqual([]);
    expect(domainBody(await agent.get("/api/council-committees?includeArchived=true").expect(200))).toEqual([
      expect.objectContaining({ id: committee.id }),
    ]);
  });
});
