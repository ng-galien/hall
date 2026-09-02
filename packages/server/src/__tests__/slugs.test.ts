import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestCouncilMember, createTestServer } from "./testServer.js";

function properties<T>(response: { body: { properties?: unknown } }): T {
  return response.body.properties as T;
}

function selfHref(response: { body: { links?: Array<{ rel: string[]; href: string }> } }): string {
  const self = response.body.links?.find((link) => link.rel.includes("self"));
  if (!self) throw new Error("Missing Siren self link");
  return self.href;
}

describe("public slugs and business numbering", () => {
  it("creates readable meeting, business, decision and resource slugs and resolves their canonical URLs", async () => {
    const { rawAgent } = await createTestServer();

    const meeting = await rawAgent
      .post("/api/council-meetings")
      .send({
        startsAt: "2026-09-17T18:30:00+02:00",
        location: "Salle du conseil",
      })
      .expect(201);
    expect(properties(meeting)).toMatchObject({
      number: "2026-001",
      slug: "2026-09-17-001",
    });
    expect(selfHref(meeting)).toBe("/api/council-meetings/2026-09-17-001");
    await rawAgent.get(selfHref(meeting)).expect(200);

    const resource = await rawAgent
      .post("/api/resources/texts")
      .send({ title: "Note de synthèse", folderPath: "conseil", tags: [], content: "Texte" })
      .expect(201);
    const createdResource = properties<{ id: string; slug: string }>(resource);
    expect(createdResource).toMatchObject({ slug: "note-de-synthese" });
    expect(selfHref(resource)).toBe("/api/resources/note-de-synthese");
    await rawAgent.get(selfHref(resource)).expect(200);

    const duplicateResource = await rawAgent
      .post("/api/resources/texts")
      .send({ title: "Note de synthèse", folderPath: "archives", tags: [], content: "Autre texte" })
      .expect(201);
    expect(properties(duplicateResource)).toMatchObject({ slug: "note-de-synthese-2" });

    const uuidTitleResource = await rawAgent
      .post("/api/resources/texts")
      .send({ title: createdResource.id, folderPath: "conseil", tags: [], content: "Collision volontaire" })
      .expect(201);
    expect(properties(uuidTitleResource)).toMatchObject({ slug: `${createdResource.id}-2` });

    const business = await rawAgent
      .post("/api/council-business")
      .send({
        kind: "matter",
        title: "Éclairage public",
        report: "Rapport",
        folderPath: "conseil",
        resourceIds: [],
      })
      .expect(201);
    expect(properties(business)).toMatchObject({ slug: "eclairage-public" });
    expect(selfHref(business)).toBe("/api/council-business/eclairage-public");
    await rawAgent.get(selfHref(business)).expect(200);

    const decision = await rawAgent
      .post("/api/council-decisions")
      .send({ title: "Subventions aux associations", draftText: "Le conseil décide", legalityReviewRequired: true })
      .expect(201);
    expect(properties(decision)).toMatchObject({ number: null, slug: "subventions-aux-associations" });
    expect(selfHref(decision)).toBe("/api/council-decisions/subventions-aux-associations");
    await rawAgent.get(selfHref(decision)).expect(200);

    await rawAgent
      .put(selfHref(meeting))
      .send({
        startsAt: "2026-09-24T18:30:00+02:00",
        location: "Salle du conseil",
      })
      .expect(409);
  });

  it("numbers an adopted decision once, using the meeting year", async () => {
    const { rawAgent } = await createTestServer();
    const members = [];
    for (const [firstName, role] of [
      ["Martine", "mayor"],
      ["Nadia", "councillor"],
      ["Jean", "councillor"],
    ] as const) {
      members.push(await createTestCouncilMember(rawAgent, { firstName, lastName: "Test", role }));
    }
    const decision = properties<{ id: string; slug: string }>(
      await rawAgent
        .post("/api/council-decisions")
        .send({ title: "Subventions aux associations", draftText: "Texte", legalityReviewRequired: true })
        .expect(201),
    );
    const business = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-business")
        .send({
          kind: "matter",
          councilDecisionId: decision.id,
          title: "Subventions aux associations",
          report: "Rapport",
          folderPath: "associations",
          resourceIds: [],
        })
        .expect(201),
    );
    const meeting = properties<{ id: string; slug: string }>(
      await rawAgent
        .post("/api/council-meetings")
        .send({
          startsAt: "2026-09-17T18:30:00+02:00",
          location: "Salle du conseil",
          chairMemberId: members[0].id,
          secretaryMemberId: members[1].id,
        })
        .expect(201),
    );
    const scheduledItem = await rawAgent
      .post(`/api/council-business/${business.id}/schedule`)
      .send({ meetingId: meeting.id, position: 1 })
      .expect(201);
    const item = properties<{ id: string }>(scheduledItem);
    expect(selfHref(scheduledItem)).toBe(`/api/council-meetings/${meeting.slug}/agenda-items/${item.id}`);
    await rawAgent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const [index, member] of members.entries()) {
      const attendance = await rawAgent
        .put(`/api/council-meetings/${meeting.slug}/attendance`)
        .send({ memberId: member.id, status: "present" })
        .expect(200);
      if (index === 0) {
        expect(selfHref(attendance)).toBe(`/api/council-meetings/${meeting.slug}/attendance/${member.id}`);
      }
    }
    await rawAgent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" }).expect(200);
    const started = await rawAgent
      .post(`/api/council-meetings/${meeting.slug}/agenda-items/${item.id}/start`)
      .expect(200);
    expect(selfHref(started)).toBe(`/api/council-meetings/${meeting.slug}/agenda-items/${item.id}`);
    const ballot = await rawAgent
      .post(`/api/council-meetings/${meeting.slug}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: decision.id,
        votes: members.map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for",
        })),
      })
      .expect(201);
    expect(selfHref(ballot)).toMatch(new RegExp(`^/api/council-meetings/${meeting.slug}/ballots/`));

    const adopted = await rawAgent.get(`/api/council-decisions/${decision.id}`).expect(200);
    expect(properties(adopted)).toMatchObject({
      number: null,
      slug: decision.slug,
      status: "adopted",
    });
    expect(selfHref(adopted)).toBe(`/api/council-decisions/${decision.slug}`);

    await rawAgent
      .post(`/api/council-meetings/${meeting.slug}/agenda-items/${item.id}/complete`)
      .send({ discussionSummary: "Adoptée à l’unanimité", status: "examined" })
      .expect(200);

    const finalized = await rawAgent.get(`/api/council-decisions/${decision.slug}`).expect(200);
    expect(properties(finalized)).toMatchObject({ number: "2026-001", slug: decision.slug, status: "adopted" });
    expect(selfHref(finalized)).toBe(`/api/council-decisions/${decision.slug}`);
  });
});
