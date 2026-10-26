import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer } from "./testServer.js";

function properties<T>(response: { body: { properties?: unknown } }): T {
  return response.body.properties as T;
}

function selfHref(response: { body: { links?: Array<{ rel: string[]; href: string }> } }): string {
  const self = response.body.links?.find((link) => link.rel.includes("self"));
  if (!self) throw new Error("Missing Siren self link");
  return self.href;
}

describe("public slugs and business numbering", () => {
  it("resolves scheduled meeting and resource slugs alongside the business canonical URL", async () => {
    const { agent: rawAgent } = await createPostgresHttpTestServer();

    const provisioned = await rawAgent.post("/api/council-meetings").send({}).expect(201);
    const meetingId = properties<{ id: string }>(provisioned).id;
    const meeting = await rawAgent
      .put(`/api/council-meetings/${meetingId}/schedule`)
      .send({ scheduledAt: "2026-09-17T18:30:00+02:00", location: "Salle du conseil" })
      .expect(200);
    expect(properties(meeting)).toMatchObject({
      number: 1,
      slug: "2026-09-17-001",
    });
    expect(selfHref(meeting)).toBe("/api/council-meetings/2026-09-17-001");
    await rawAgent.get(selfHref(meeting)).expect(200);

    const resource = await rawAgent
      .post("/api/resources")
      .send({ kind: "text", name: "Note de synthèse", path: "conseil", content: "Texte" })
      .expect(201);
    const createdResource = properties<{ id: string; slug: string }>(resource);
    expect(createdResource).toMatchObject({ slug: "note-de-synthese" });
    expect(selfHref(resource)).toBe("/api/resources/note-de-synthese");
    await rawAgent.get(selfHref(resource)).expect(200);

    const duplicateResource = await rawAgent
      .post("/api/resources")
      .send({ kind: "text", name: "Note de synthèse", path: "archives", content: "Autre texte" })
      .expect(201);
    expect(properties(duplicateResource)).toMatchObject({ slug: "note-de-synthese-2" });

    const uuidTitleResource = await rawAgent
      .post("/api/resources")
      .send({ kind: "text", name: createdResource.id, path: "conseil", content: "Collision volontaire" })
      .expect(201);
    expect(properties(uuidTitleResource)).toMatchObject({ slug: `${createdResource.id}-2` });

    const business = await rawAgent
      .post("/api/council-business")
      .send({
        path: "conseil",
        name: "Éclairage public",
        reportName: "Rapport",
        reportContent: "Rapport",
      })
      .expect(201);
    expect(selfHref(business)).toBe(`/api/council-business/${properties<{ id: string }>(business).id}`);
    await rawAgent.get(selfHref(business)).expect(200);

    await rawAgent
      .put(selfHref(meeting))
      .send({
        scheduledAt: "2026-09-24T18:30:00+02:00",
        location: "Salle du conseil",
      })
      .expect(404);
  });

  it("numbers a confirmed decision once and resolves its canonical URL", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const databaseRequest = {
      role: "hall_api_authenticated" as const,
      context: {
        requestId: "decision-number-fixture",
        actorId: "test-clerk",
        roles: ["administrator"],
        contactId: null,
      },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(databaseRequest, 1);
    const contact = properties<{ id: string }>(
      await agent.post("/api/contacts").send({ firstName: "Martine", lastName: "Test" }).expect(201),
    );
    const member = properties<{ id: string }>(
      await agent
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "mayor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    const meeting = properties<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
      })
      .expect(200);
    const business = properties<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          path: "associations",
          name: "Subventions aux associations",
          reportName: "Rapport",
          reportContent: "Présentation",
        })
        .expect(201),
    );
    const proposal = properties<{ id: string }>(
      await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "councilDecisionProposal", name: "Subventions aux associations", content: "Texte" })
        .expect(201),
    );
    const item = properties<{ id: string }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "councilDecisionProposal", subjectId: proposal.id, position: 1 })
        .expect(201),
    );
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(databaseRequest, meeting.id);
    const facts = await council.noticeFacts(databaseRequest, meeting.id);
    if (!facts) throw new Error("Frozen notice facts are required");
    await council.generateNotice(
      databaseRequest,
      meeting.id,
      { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        observedAt: "2026-09-10T16:30:00Z",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
        attendance: [{ councilMemberId: member.id, status: "present" }],
      })
      .expect(200);
    const started = await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`)
      .send({ startedAt: "2026-09-10T16:31:00Z" })
      .expect(200);
    expect(selfHref(started)).toContain(`/agenda-items/${item.id}`);
    const attendance = await council.listAttendance(databaseRequest, meeting.id);
    const candidate = {
      procedure: "ordinaryMajority",
      mode: "public",
      participantAttendanceIds: [attendance[0].id],
      votes: [{ meetingAttendanceId: attendance[0].id, choice: "approve" }],
      nonParticipations: [],
    };
    const preview = properties<{ id: string }>(
      await agent.post("/api/ballot-previews").send({ agendaItemId: item.id, candidate }).expect(201),
    );
    await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(200);
    const list = await agent.get("/api/council-decisions").expect(200);
    expect(list.body.entities).toHaveLength(1);
    const decision = list.body.entities[0].properties as { id: string; number: string; title: string };
    expect(decision).toMatchObject({ number: "2026-09-01", title: "Subventions aux associations" });
    const canonical = await agent.get(`/api/council-decisions/${decision.id}`).expect(200);
    expect(selfHref(canonical)).toBe(`/api/council-decisions/${decision.id}`);
    await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(409);
    const stable = await agent.get(`/api/council-decisions/${decision.id}`).expect(200);
    expect(properties<{ number: string }>(stable).number).toBe(decision.number);
  });
});
