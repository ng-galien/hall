import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("council committees", () => {
  it("manages dated memberships and classifies a council matter", async () => {
    const { agent } = await createTestServer();
    const memberResponse = await agent
      .post("/api/council-members")
      .send({
        firstName: "Alice",
        lastName: "Martin",
        phone: "+33 6 12 34 56 78",
        role: "councillor",
        termStartedOn: "2026-03-22",
      })
      .expect(201);
    const member = domainBody<{ id: string }>(memberResponse);
    expect(memberResponse.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "member.update", method: "PUT" })]),
    );
    const updatedMember = domainBody<{
      email: string | null;
      phone: string | null;
      active: boolean;
      termEndedOn: string | null;
    }>(
      await agent
        .put(`/api/council-members/${member.id}`)
        .send({
          firstName: "Alice",
          lastName: "Martin",
          email: "alice.martin@example.fr",
          phone: "+33 6 87 65 43 21",
          role: "councillor",
          termStartedOn: "2026-03-22",
          termEndedOn: null,
        })
        .expect(200),
    );
    expect(updatedMember).toMatchObject({
      email: "alice.martin@example.fr",
      phone: "+33 6 87 65 43 21",
      active: true,
      termEndedOn: null,
    });
    const committee = domainBody<{ id: string; slug: string }>(
      await agent
        .post("/api/council-committees")
        .send({ name: "Commission vie associative", description: "Prépare les dossiers associatifs." })
        .expect(201),
    );
    expect(committee.slug).toBe("commission-vie-associative");

    const membership = domainBody<{ id: string; endedOn: string | null }>(
      await agent
        .post(`/api/council-committees/${committee.id}/memberships`)
        .send({ councilMemberId: member.id, role: "chair", startedOn: "2026-03-22" })
        .expect(201),
    );
    expect(membership.endedOn).toBeNull();
    await agent
      .post(`/api/council-committees/${committee.id}/memberships`)
      .send({ councilMemberId: member.id, role: "member", startedOn: "2026-04-01" })
      .expect(409);

    const committeeDetails = await agent.get(`/api/council-committees/${committee.slug}`).expect(200);
    const embeddedMembership = committeeDetails.body.entities.find(
      (entity: { properties?: { id?: string } }) => entity.properties?.id === membership.id,
    );
    expect(embeddedMembership.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "committee.update-membership", method: "PUT" }),
        expect.objectContaining({ name: "committee.end-membership", method: "POST" }),
      ]),
    );
    expect(domainBody<{ id: string }>(await agent.get(embeddedMembership.links[0].href).expect(200)).id).toBe(
      membership.id,
    );

    const updatedMembership = domainBody<{ role: string; startedOn: string; endedOn: string | null }>(
      await agent
        .put(`/api/council-committees/${committee.id}/memberships/${membership.id}`)
        .send({ role: "viceChair", startedOn: "2026-03-23", endedOn: null })
        .expect(200),
    );
    expect(updatedMembership).toMatchObject({ role: "viceChair", startedOn: "2026-03-23", endedOn: null });

    const matter = domainBody<{ committeeId: string | null }>(
      await agent
        .post("/api/council-business")
        .send({
          kind: "matter",
          committeeId: committee.id,
          title: "Subventions 2026",
          report: "Instruction des demandes.",
          folderPath: "finances/subventions",
          resourceIds: [],
        })
        .expect(201),
    );
    expect(matter.committeeId).toBe(committee.id);

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

    const details = domainBody(await agent.get(`/api/council-committees/${committee.slug}`).expect(200)) as {
      memberships: Array<{ id: string; endedOn: string | null }>;
    };
    expect(details.memberships).toEqual([expect.objectContaining({ id: membership.id, endedOn: "2026-12-31" })]);
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
