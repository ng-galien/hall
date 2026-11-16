import type { MinutesDetail } from "@hall/api-contract";
import { PostgresCouncil } from "@hall/postgres";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, domainBody } from "../src/__tests__/testServer.js";

const password = "Minutes-secretary-2026!";
const minutesActions = (body: { actions?: Array<{ name: string }> }) => (body.actions ?? []).map((entry) => entry.name);

// @verifies-requirement HALL-FR-MIN-300
describe("minutes drafted by the meeting secretary through HTTP", () => {
  it("offers and accepts the draft edit and the generation to the councillor who was secretary, and to no other councillor", async () => {
    const { agent: admin, pool, url } = await createPostgresHttpTestServer({ devAutoLogin: false });
    await admin
      .post("/api/auth/bootstrap")
      .send({ email: "admin@example.test", displayName: "Admin", password })
      .expect(201);
    await admin.put("/api/council-terms").send({ expectedMemberCount: 3 }).expect(200);
    const councilMember = async (firstName: string, role: "mayor" | "councillor") => {
      const contact = domainBody<{ id: string }>(
        await admin.post("/api/contacts").send({ firstName, lastName: "Martin" }).expect(201),
      );
      const member = domainBody<{ id: string }>(
        await admin
          .post("/api/council-members")
          .send({ contactId: contact.id, role, termStartedOn: "2026-03-22" })
          .expect(201),
      );
      return { id: member.id, contactId: contact.id };
    };
    const mayor = await councilMember("Alice", "mayor");
    const secretary = await councilMember("Bruno", "councillor");
    const other = await councilMember("Claire", "councillor");
    for (const [name, member] of [
      ["bruno", secretary],
      ["claire", other],
    ] as const)
      await admin
        .post("/api/users")
        .send({
          email: `${name}@example.test`,
          displayName: name,
          password,
          roles: ["councillor"],
          contactId: member.contactId,
        })
        .expect(201);

    const meeting = domainBody<{ id: string }>(await admin.post("/api/council-meetings").send({}).expect(201));
    await admin
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
        chairMemberId: mayor.id,
        secretaryMemberId: secretary.id,
      })
      .expect(200);
    const business = domainBody<{ id: string }>(
      await admin
        .post("/api/council-business")
        .send({ path: "conseil", name: "Travaux", reportName: "Rapport", reportContent: "" })
        .expect(201),
    );
    const subject = domainBody<{ id: string }>(
      await admin
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Travaux", content: "" })
        .expect(201),
    );
    const agendaItem = domainBody<{ id: string }>(
      await admin
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
        .expect(201),
    );
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "minutes-secretary", actorId: "test-admin", roles: ["administrator"], contactId: null },
    };
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
    await admin
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        chairMemberId: mayor.id,
        secretaryMemberId: secretary.id,
        attendance: [mayor, secretary, other].map((member) => ({ councilMemberId: member.id, status: "present" })),
      })
      .expect(200);
    const closed = domainBody<{ minutes: { id: string } }>(
      await admin.post(`/api/council-meetings/${meeting.id}/close`).send({}).expect(200),
    );
    const path = `/api/minutes/${closed.minutes.id}`;

    const secretaryAgent = request.agent(url);
    await secretaryAgent.post("/api/auth/login").send({ email: "bruno@example.test", password }).expect(200);
    const otherAgent = request.agent(url);
    await otherAgent.post("/api/auth/login").send({ email: "claire@example.test", password }).expect(200);

    const openedByOther = await otherAgent.get(path).expect(200);
    expect(minutesActions(openedByOther.body)).toEqual([]);
    const draft = domainBody<MinutesDetail>(openedByOther);
    await otherAgent
      .patch(`${path}/draft`)
      .send({ expectedVersion: draft.version, agendaItemId: agendaItem.id, content: "Refused" })
      .expect(403);
    await otherAgent.post(`${path}/generate`).send({ expectedVersion: draft.version }).expect(403);

    const openedBySecretary = await secretaryAgent.get(path).expect(200);
    expect(minutesActions(openedBySecretary.body)).toEqual(["minutes.update-draft", "minutes.generate"]);
    const edited = domainBody<MinutesDetail>(
      await secretaryAgent
        .patch(`${path}/draft`)
        .send({ expectedVersion: draft.version, agendaItemId: agendaItem.id, content: "Rédigé par le secrétaire" })
        .expect(200),
    );
    expect(edited.version).toBe(draft.version + 1);
  });
});
