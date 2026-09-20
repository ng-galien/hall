import { randomUUID } from "node:crypto";
import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { describe, expect, it } from "vitest";
import {
  createPostgresHttpTestServer,
  createTestCouncilMember,
  createTestServer,
  domainBody,
  type TestAgent,
} from "../../src/__tests__/testServer.js";
import { createClosedMeetingWithMinutes } from "./minutesLifecycleFixture.js";

async function createMember(agent: TestAgent, firstName: string) {
  return createTestCouncilMember(agent, { firstName });
}

describe("backend business-rule coverage", () => {
  it("validates business references and keeps scheduled proposals stable", async () => {
    const { agent } = await createPostgresHttpTestServer();
    const business = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          path: "conseil",
          name: "Décision programmée",
          reportName: "Rapport",
          reportContent: "",
        })
        .expect(201),
    );
    const missingResource = await agent
      .post(`/api/council-business/${business.id}/resources`)
      .send({ resourceId: randomUUID() });
    expect(missingResource.status, JSON.stringify(missingResource.body)).toBe(409);
    expect(missingResource.body.code).toBe("conflict");
    await agent.get(`/api/council-meetings/${randomUUID()}`).expect(404);
    const proposal = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "councilDecisionProposal", name: "Première décision", content: "Texte" })
        .expect(201),
    );
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent
      .put(`/api/council-meetings/${meeting.id}/schedule`)
      .send({
        scheduledAt: "2026-11-12T18:30:00+01:00",
        location: "Salle du conseil",
      })
      .expect(200);
    const scheduled = domainBody<{ id: string; subject: { kind: string; id: string } }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "councilDecisionProposal", subjectId: proposal.id, position: 1 })
        .expect(201),
    );
    expect(scheduled.subject).toMatchObject({ kind: "councilDecisionProposal", id: proposal.id });
    const invalidReplacement = await agent.put(`/api/council-business/${business.id}`).send({
      kind: "matter",
      councilDecisionId: randomUUID(),
      title: "Autre décision",
      report: "",
    });
    expect(invalidReplacement.status).toBe(404);
    const stillScheduled = domainBody<{ subject: { id: string } }>(
      await agent.get(`/api/council-meetings/${meeting.id}/agenda-items/${scheduled.id}`).expect(200),
    );
    expect(stillScheduled.subject.id).toBe(proposal.id);
  });

  it("rejects malformed preparation commands before they can alter the agenda", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "invalid-preparation", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 3);
    const members = [];
    for (const name of ["Alice", "Benoît", "Claire"]) members.push(await createMember(agent, name));
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent
      .put(`/api/council-meetings/${meeting.id}/schedule`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
      })
      .expect(200);
    const createItem = async (name: string, position: number) => {
      const business = domainBody<{ id: string }>(
        await agent
          .post("/api/council-business")
          .send({
            path: "conseil",
            name,
            reportName: "Rapport",
            reportContent: "",
          })
          .expect(201),
      );
      const subject = domainBody<{ id: string }>(
        await agent
          .post(`/api/council-business/${business.id}/prepared-subjects`)
          .send({ kind: "openQuestion", name, content: "" })
          .expect(201),
      );
      return domainBody<{ id: string }>(
        await agent
          .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
          .send({ kind: "openQuestion", subjectId: subject.id, position })
          .expect(201),
      );
    };
    const firstItem = await createItem("Premier point", 1);
    const secondItem = await createItem("Second point", 2);
    const agendaPath = `/api/council-meetings/${meeting.id}/agenda-items`;
    const expectedIds = [firstItem.id, secondItem.id];
    const duplicateOrder = await agent
      .put(`/api/council-meetings/${meeting.id}/agenda-order`)
      .send({ agendaItemIds: [firstItem.id, firstItem.id] });
    expect(duplicateOrder.status, JSON.stringify(duplicateOrder.body)).toBe(400);
    const invalidOfficers = await agent
      .put(`/api/council-meetings/${meeting.id}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: randomUUID() });
    expect(invalidOfficers.status, JSON.stringify(invalidOfficers.body)).toBe(409);
    const prematureQuestion = await agent
      .post(`/api/council-meetings/${meeting.id}/open-questions`)
      .send({ path: "conseil", name: "Trop tôt", content: "" });
    expect(prematureQuestion.status, JSON.stringify(prematureQuestion.body)).toBe(409);
    const stillScheduled = domainBody<Array<{ id: string }>>(await agent.get(agendaPath).expect(200));
    expect(stillScheduled.map((item) => item.id)).toEqual(expectedIds);
    await agent
      .put(`/api/council-meetings/${meeting.id}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: members[1].id })
      .expect(200);
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(context, meeting.id);
    const facts = await council.noticeFacts(context, meeting.id);
    if (!facts) throw new Error("Frozen notice facts are required");
    await council.generateNotice(
      context,
      meeting.id,
      { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    const selfProxy = await agent.post(`/api/council-meetings/${meeting.id}/record-opening`).send({
      observedAt: "2026-09-10T16:30:00Z",
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance: [
        { councilMemberId: members[0].id, status: "present" },
        { councilMemberId: members[1].id, status: "present" },
        {
          councilMemberId: members[2].id,
          status: "represented",
          proxyHolderCouncilMemberId: members[2].id,
          proxyDocumentId: randomUUID(),
        },
      ],
    });
    expect(selfProxy.status, JSON.stringify(selfProxy.body)).toBe(409);
    const unaltered = domainBody<Array<{ id: string }>>(await agent.get(agendaPath).expect(200));
    expect(unaltered.map((item) => item.id)).toEqual(expectedIds);
  });

  it("keeps the previous minutes approval first and unique on the successor agenda", async () => {
    const { agent, pool, closure } = await createClosedMeetingWithMinutes();
    const agendaPath = `/api/council-meetings/${closure.nextMeeting.id}/agenda-items`;
    const agenda = domainBody<
      Array<{
        id: string;
        position: number;
        subject: { kind: string; minutesId?: string };
      }>
    >(await agent.get(agendaPath).expect(200));
    expect(agenda).toHaveLength(2);
    expect(agenda[0]).toMatchObject({
      position: 1,
      subject: { kind: "minutesApproval", minutesId: closure.minutes.id },
    });
    expect(agenda[1].subject.kind).toBe("openQuestion");
    const invalidOrder = await agent
      .put(`/api/council-meetings/${closure.nextMeeting.id}/agenda-order`)
      .send({ agendaItemIds: [agenda[1].id, agenda[0].id] });
    expect(invalidOrder.status, JSON.stringify(invalidOrder.body)).toBe(409);
    expect(domainBody(await agent.get(agendaPath).expect(200))).toEqual(agenda);
    await expect(
      pool.query("INSERT INTO hall.minutes_approval(id, minutes) VALUES ($1, $2)", [randomUUID(), closure.minutes.id]),
    ).rejects.toMatchObject({ code: "23505" });
    const approvalCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM hall.minutes_approval WHERE minutes = $1",
      [closure.minutes.id],
    );
    expect(approvalCount.rows[0].count).toBe("1");
  });

  it("rejects an unknown officer without changing the prepared meeting", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "meeting-officer", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 3);
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    const invalidOfficer = await agent.put(`/api/council-meetings/${meeting.id}/prepare`).send({
      scheduledAt: "2026-11-12T18:30:00+01:00",
      location: "Salle du conseil",
      chairMemberId: randomUUID(),
      secretaryMemberId: members[1].id,
    });
    expect(invalidOfficer.status, JSON.stringify(invalidOfficer.body)).toBe(409);
    const afterRejection = domainBody<{ startedAt: string | null; chairMemberId: string | null }>(
      await agent.get(`/api/council-meetings/${meeting.id}`).expect(200),
    );
    expect(afterRejection.startedAt).toBeNull();
    expect(afterRejection.chairMemberId).toBeNull();
    await agent
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-11-12T18:30:00+01:00",
        location: "Salle du conseil",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      })
      .expect(200);
  });

  it("rejects invalid ballot voters and preserves a confirmed ballot", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "immutable-ballot", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 3);
    const members = [];
    for (const firstName of ["Alice", "Benoît", "Claire"]) {
      members.push(
        await createTestCouncilMember(agent, {
          firstName,
          role: firstName === "Alice" ? "mayor" : "councillor",
        }),
      );
    }
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Council chamber",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      })
      .expect(200);
    const business = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          path: "conseil",
          name: "Décision à voter",
          reportName: "Rapport",
          reportContent: "Présentation",
        })
        .expect(201),
    );
    const proposal = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "councilDecisionProposal", name: "Décision à voter", content: "Texte" })
        .expect(201),
    );
    const item = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "councilDecisionProposal", subjectId: proposal.id, position: 1 })
        .expect(201),
    );
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(context, meeting.id);
    const noticeFacts = await council.noticeFacts(context, meeting.id);
    if (!noticeFacts) throw new Error("Frozen notice facts are required");
    await council.generateNotice(
      context,
      meeting.id,
      { meeting: noticeFacts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        observedAt: "2026-09-10T16:30:00Z",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
        attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
      })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`)
      .send({ startedAt: "2026-09-10T16:31:00Z" })
      .expect(200);
    const attendance = await council.listAttendance(context, meeting.id);
    const candidate = {
      procedure: "ordinaryMajority",
      mode: "public",
      participantAttendanceIds: attendance.map((entry) => entry.id),
      chairmanAttendanceId: attendance.find((entry) => entry.councilMemberId === members[0].id)!.id,
      votes: attendance.map((entry) => ({ meetingAttendanceId: entry.id, choice: "approve" })),
      nonParticipations: [],
    };
    const invalidVoter = await agent.post("/api/ballot-previews").send({
      agendaItemId: item.id,
      candidate: { ...candidate, votes: [{ meetingAttendanceId: randomUUID(), choice: "approve" }] },
    });
    expect(invalidVoter.status, JSON.stringify(invalidVoter.body)).toBe(409);
    const preview = domainBody<{ id: string }>(
      await agent.post("/api/ballot-previews").send({ agendaItemId: item.id, candidate }).expect(201),
    );
    const ballot = domainBody<{ id: string }>(
      await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(200),
    );
    await agent.delete(`/api/ballots/${ballot.id}`).expect(404);
    await expect(pool.query("DELETE FROM hall.ballots WHERE id = $1", [ballot.id])).rejects.toMatchObject({
      code: "HV401",
    });
    await agent.get(`/api/ballots/${ballot.id}`).expect(200);
    const stored = await pool.query("SELECT id FROM hall.ballots WHERE id = $1", [ballot.id]);
    expect(stored.rows).toEqual([{ id: ballot.id }]);
  });

  it("protects user links and the last active administrator", async () => {
    const { rawAgent, container } = await createTestServer({ devAutoLogin: false });
    const administrator = {
      email: "admin@example.fr",
      displayName: "Administration",
      password: "Mot-de-passe-demo-2026!",
    };
    const bootstrap = await rawAgent.post("/api/auth/bootstrap").send(administrator).expect(201);
    const administratorId = domainBody<{ id: string }>(bootstrap).id;
    expect(await container.cradle.authService.bootstrapRequired()).toBe(false);
    await rawAgent.get(`/api/users/${administratorId}`).expect(200);
    await rawAgent.get(`/api/users/${randomUUID()}`).expect(404);

    const invalidMember = await rawAgent.post("/api/users").send({
      email: "invalide@example.fr",
      displayName: "Lien invalide",
      password: "Mot-de-passe-invalide-2026!",
      roles: ["reader"],
      contactId: randomUUID(),
    });
    expect(invalidMember.status).toBe(404);
    expect(domainBody(invalidMember).code).toBe("contact_not_found");

    const secondAdministrator = domainBody<{ id: string }>(
      await rawAgent
        .post("/api/users")
        .send({
          email: "admin-2@example.fr",
          displayName: "Seconde administration",
          password: "Mot-de-passe-admin-2-2026!",
          roles: ["administrator"],
          contactId: null,
        })
        .expect(201),
    );
    await rawAgent.post(`/api/users/${administratorId}/disable`).expect(200);
    await rawAgent.get("/api/auth/session").expect(401);

    await rawAgent
      .post("/api/auth/login")
      .send({ email: "admin-2@example.fr", password: "Mot-de-passe-admin-2-2026!" })
      .expect(200);
    await rawAgent.post(`/api/users/${randomUUID()}/disable`).expect(404);
    const lastAdministrator = await rawAgent.post(`/api/users/${secondAdministrator.id}/disable`);
    expect(lastAdministrator.status).toBe(409);
    expect(domainBody(lastAdministrator).code).toBe("last_administrator_required");
  });

  it("updates templates atomically and reports missing templates", async () => {
    const { agent } = await createTestServer();
    const created = domainBody<{ id: string }>(
      await agent
        .post("/api/templates")
        .send({
          kind: "pdf",
          documentType: "minutes",
          name: "Procès-verbal",
          bodyMarkdown: "# Procès-verbal",
          subject: null,
          stylesheet: "",
          headerHtml: "",
          footerHtml: "",
        })
        .expect(201),
    );
    const updated = domainBody<{ name: string; bodyMarkdown: string }>(
      await agent
        .put(`/api/templates/${created.id}`)
        .send({
          kind: "pdf",
          documentType: "minutes",
          name: "Procès-verbal validé",
          bodyMarkdown: "# Procès-verbal\n\nVersion validée.",
          subject: null,
          stylesheet: "body { color: #111; }",
          headerHtml: "",
          footerHtml: "",
        })
        .expect(200),
    );
    expect(updated).toMatchObject({
      name: "Procès-verbal validé",
      bodyMarkdown: "# Procès-verbal\n\nVersion validée.\n",
    });

    const missingId = randomUUID();
    await agent
      .put(`/api/templates/${missingId}`)
      .send({
        kind: "pdf",
        documentType: "minutes",
        name: "Absent",
        bodyMarkdown: "",
        subject: null,
        stylesheet: "",
        headerHtml: "",
        footerHtml: "",
      })
      .expect(404);
    await agent.delete(`/api/templates/${missingId}`).expect(404);
  });
});
