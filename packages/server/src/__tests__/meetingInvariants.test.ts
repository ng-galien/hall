import { describe, expect, it } from "vitest";
import { validateServerConfig } from "../core/config.js";
import { createTestServer, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string) {
  const response = await agent.post("/api/council-members").send({
    firstName,
    lastName: "Martin",
    email: null,
    role: "councillor",
    termStartedOn: "2026-03-22",
  });
  expect(response.status, `${JSON.stringify(response.body)} ${response.text}`).toBe(201);
  return response.body as { id: string };
}

async function createMeeting(agent: TestAgent) {
  const response = await agent.post("/api/council-meetings").send({
    title: "Council meeting",
    startsAt: "2026-09-10T18:30:00+02:00",
    location: "Council chamber",
  });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

describe("council meeting invariants", () => {
  it("freezes the serving council when the meeting is scheduled", async () => {
    const { agent } = await createTestServer();
    const first = await createMember(agent, "Alice");
    await createMember(agent, "Benoît");
    await createMember(agent, "Claire");
    const meeting = await createMeeting(agent);

    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    const lateMember = await createMember(agent, "Diane");

    const rejectedAttendance = await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: lateMember.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null });
    expect(rejectedAttendance.status).toBe(404);
    expect(rejectedAttendance.body.code).toBe("council_member_not_found");

    const firstAttendance = await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: first.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
    expect(firstAttendance.body.version).toBe(1);
    const updatedAttendance = await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({
        memberId: first.id,
        status: "excused",
        proxyHolderMemberId: null,
        proxyDocumentId: null,
        expectedVersion: 1,
      })
      .expect(200);
    expect(updatedAttendance.body.version).toBe(2);
    const staleUpdate = await agent.put(`/api/council-meetings/${meeting.id}/attendance`).send({
      memberId: first.id,
      status: "present",
      proxyHolderMemberId: null,
      proxyDocumentId: null,
      expectedVersion: 1,
    });
    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.code).toBe("conflict");
    const aggregate = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(aggregate.body.rosterMemberIds).toHaveLength(3);
    expect(aggregate.body.quorum).toMatchObject({
      activeMembers: 3,
      physicallyPresent: 0,
      required: 2,
      reached: false,
    });
  });

  it("creates a reconvened meeting only from a scheduled meeting without quorum", async () => {
    const { agent } = await createTestServer();
    const first = await createMember(agent, "Alice");
    const second = await createMember(agent, "Benoît");
    const third = await createMember(agent, "Claire");
    const meeting = await createMeeting(agent);
    const topic = await agent
      .post("/api/topics")
      .send({
        kind: "subject",
        title: "Information",
        report: "",
      })
      .expect(201);
    await agent.post(`/api/topics/${topic.body.id}/schedule`).send({ meetingId: meeting.id, position: 1 }).expect(201);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: first.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
    const incompleteFailure = await agent.post(`/api/council-meetings/${meeting.id}/quorum-failure`);
    expect(incompleteFailure.status).toBe(409);
    expect(incompleteFailure.body.code).toBe("attendance_incomplete");
    for (const memberId of [second.id, third.id]) {
      const absentAttendance = await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId, status: "absent", proxyHolderMemberId: null, proxyDocumentId: null });
      expect(absentAttendance.status, JSON.stringify(absentAttendance.body)).toBe(200);
    }

    const reconvenedInput = {
      title: "Reconvened council meeting",
      startsAt: "2026-09-12T18:30:00+02:00",
      location: "Council chamber",
    };
    const prematureReconvocation = await agent
      .post(`/api/council-meetings/${meeting.id}/reconvene`)
      .send(reconvenedInput);
    expect(prematureReconvocation.status).toBe(409);
    expect(prematureReconvocation.body.code).toBe("invalid_meeting_transition");

    const failure = await agent.post(`/api/council-meetings/${meeting.id}/quorum-failure`).expect(201);
    expect(failure.body.quorumFailure).toMatchObject({
      rosterMemberIds: expect.arrayContaining([first.id, second.id, third.id]),
      quorum: { activeMembers: 3, physicallyPresent: 1, required: 2, reached: false },
    });

    const lateTopic = await agent
      .post("/api/topics")
      .send({ kind: "openQuestion", title: "Late information", report: "" })
      .expect(201);

    const [lateAgenda, reconvened] = await Promise.all([
      agent.post(`/api/topics/${lateTopic.body.id}/schedule`).send({ meetingId: meeting.id, position: 2 }),
      agent.post(`/api/council-meetings/${meeting.id}/reconvene`).send(reconvenedInput),
    ]);
    expect(lateAgenda.status).toBe(409);
    expect(lateAgenda.body.code).toBe("agenda_inconsistent");
    expect(reconvened.status).toBe(201);
    expect(reconvened.body).toMatchObject({
      status: "scheduled",
      isReconvenedMeeting: true,
      previousMeetingId: meeting.id,
    });
    expect(typeof reconvened.body.id, JSON.stringify(reconvened.body)).toBe("string");

    const aggregate = await agent.get(`/api/council-meetings/${reconvened.body.id}`).expect(200);
    expect(aggregate.body.rosterMemberIds).toHaveLength(3);
    expect(aggregate.body.agendaItems).toHaveLength(1);
    expect(aggregate.body.quorum.reached).toBe(true);
    const previous = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(previous.body.meeting.status).toBe("closed");
    expect(previous.body.meeting.quorumFailure.recordedAt).toBeTruthy();
    expect(previous.body.agendaItems[0]).toMatchObject({ status: "postponed" });
  });

  it("requires roster officers before a meeting starts", async () => {
    const { agent } = await createTestServer();
    const chair = await createMember(agent, "Alice");
    const secretary = await createMember(agent, "Benoît");
    const third = await createMember(agent, "Claire");
    const meeting = await createMeeting(agent);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const memberId of [chair.id, secretary.id]) {
      await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }

    const incompleteAttendance = await agent
      .put(`/api/council-meetings/${meeting.id}/status`)
      .send({ status: "inProgress" });
    expect(incompleteAttendance.status, JSON.stringify(incompleteAttendance.body)).toBe(409);
    expect(incompleteAttendance.body.code).toBe("attendance_incomplete");

    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: third.id, status: "absent", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);

    const missingOfficers = await agent
      .put(`/api/council-meetings/${meeting.id}/status`)
      .send({ status: "inProgress" });
    expect(missingOfficers.status, JSON.stringify(missingOfficers.body)).toBe(409);
    expect(missingOfficers.body.code).toBe("meeting_officers_required");

    await agent
      .put(`/api/council-meetings/${meeting.id}/officers`)
      .send({ chairMemberId: chair.id, secretaryMemberId: secretary.id })
      .expect(200);
    const opened = await agent
      .put(`/api/council-meetings/${meeting.id}/status`)
      .send({ status: "inProgress" })
      .expect(200);
    expect(opened.body).toMatchObject({ chairMemberId: chair.id, secretaryMemberId: secretary.id });
  });

  it("requires the chair and secretary to be physically present before a meeting starts", async () => {
    const { agent } = await createTestServer();
    const chair = await createMember(agent, "Alice");
    const secretary = await createMember(agent, "Benoît");
    const third = await createMember(agent, "Claire");
    const meeting = await createMeeting(agent);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const [memberId, status] of [
      [chair.id, "absent"],
      [secretary.id, "present"],
      [third.id, "present"],
    ] as const) {
      await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId, status, proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent
      .put(`/api/council-meetings/${meeting.id}/officers`)
      .send({ chairMemberId: chair.id, secretaryMemberId: secretary.id })
      .expect(200);

    const opened = await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" });
    expect(opened.status, JSON.stringify(opened.body)).toBe(409);
    expect(opened.body.code).toBe("meeting_officers_required");
  });

  it("requires a complete attendance sheet before opening a reconvened meeting", async () => {
    const { agent } = await createTestServer();
    const chair = await createMember(agent, "Alice");
    const secretary = await createMember(agent, "Benoît");
    const third = await createMember(agent, "Claire");
    const meeting = await createMeeting(agent);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const [memberId, status] of [
      [chair.id, "present"],
      [secretary.id, "absent"],
      [third.id, "absent"],
    ] as const) {
      await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId, status, proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.post(`/api/council-meetings/${meeting.id}/quorum-failure`).expect(201);
    const reconvened = await agent
      .post(`/api/council-meetings/${meeting.id}/reconvene`)
      .send({
        title: "Reconvened council meeting",
        startsAt: "2026-09-12T18:30:00+02:00",
        location: "Council chamber",
        chairMemberId: chair.id,
        secretaryMemberId: secretary.id,
      })
      .expect(201);

    const opened = await agent.put(`/api/council-meetings/${reconvened.body.id}/status`).send({ status: "inProgress" });
    expect(opened.status, JSON.stringify(opened.body)).toBe(409);
    expect(opened.body.code).toBe("attendance_incomplete");
  });

  it("returns proxy_invalid when one member would carry two proxies", async () => {
    const { agent } = await createTestServer();
    const holder = await createMember(agent, "Alice");
    const firstPrincipal = await createMember(agent, "Benoît");
    const secondPrincipal = await createMember(agent, "Claire");
    const meeting = await createMeeting(agent);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: holder.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
    const uploadProxy = () =>
      agent
        .post("/api/resources/documents")
        .field("meetingId", meeting.id)
        .field("category", "proxy")
        .attach("file", Buffer.from("Written proxy"), { filename: "proxy.pdf", contentType: "application/pdf" });
    const firstDocument = await uploadProxy();
    const secondDocument = await uploadProxy();
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({
        memberId: firstPrincipal.id,
        status: "represented",
        proxyHolderMemberId: holder.id,
        proxyDocumentId: firstDocument.body.id,
      })
      .expect(200);
    const duplicate = await agent.put(`/api/council-meetings/${meeting.id}/attendance`).send({
      memberId: secondPrincipal.id,
      status: "represented",
      proxyHolderMemberId: holder.id,
      proxyDocumentId: secondDocument.body.id,
    });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.code).toBe("proxy_invalid");
  });

  it("rolls back every repository change in a failed unit of work", async () => {
    const { container } = await createTestServer();
    await expect(
      container.cradle.unitOfWork.execute(async () => {
        await container.cradle.resourceRepository.createText({
          title: "Rollback test",
          folderPath: "Tests",
          tags: [],
          content: "Rollback",
        });
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");
    expect(await container.cradle.resourceRepository.list()).toHaveLength(0);
  });

  it("translates persistence conflicts into a stable API error", async () => {
    const { agent } = await createTestServer();
    const decision = await agent
      .post("/api/council-decisions")
      .send({ title: "Unique topic decision", draftText: "", legalityReviewRequired: false })
      .expect(201);
    const topic = {
      kind: "subject",
      councilDecisionId: decision.body.id,
      title: "Unique decision topic",
      report: "",
    };
    await agent.post("/api/topics").send(topic).expect(201);
    const duplicate = await agent.post("/api/topics").send(topic);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ code: "conflict" });
  });

  it("protects the administrative API when a shared-server token is configured", async () => {
    const { agent } = await createTestServer("shared-secret");
    await agent.get("/api/health").expect(200);
    const unauthorized = await agent.get("/api/council-members");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.code).toBe("authentication_required");
    await agent.get("/api/council-members").set("Authorization", "Bearer shared-secret").expect(200);
  });

  it("rejects a non-loopback listener without authentication and a TLS proxy", () => {
    expect(() => validateServerConfig({ host: "0.0.0.0", port: 3100, databasePath: ":memory:" })).toThrow();
    expect(() =>
      validateServerConfig({
        host: "0.0.0.0",
        port: 3100,
        databasePath: ":memory:",
        apiToken: "shared-secret",
        behindTlsProxy: true,
      }),
    ).not.toThrow();
  });
});
