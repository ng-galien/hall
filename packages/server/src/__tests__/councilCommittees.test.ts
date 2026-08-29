import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("council committees", () => {
  it("manages dated memberships and classifies a council matter", async () => {
    const { agent } = await createTestServer();
    const member = domainBody<{ id: string }>(
      await agent
        .post("/api/council-members")
        .send({
          firstName: "Alice",
          lastName: "Martin",
          role: "councillor",
          termStartedOn: "2026-03-22",
        })
        .expect(201),
    );
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
