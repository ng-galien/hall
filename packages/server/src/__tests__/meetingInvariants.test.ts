import { describe, expect, it } from "vitest";
import { validateServerConfig } from "../core/config.js";
import { hasThreeClearDays } from "../services/reconvocationPolicy.js";
import { createTestCouncilMember, createTestServer, domainBody, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string) {
  return createTestCouncilMember(agent, { firstName });
}

async function createMeeting(agent: TestAgent) {
  const response = await agent.post("/api/council-meetings").send({
    startsAt: "2026-09-10T18:30:00+02:00",
    location: "Council chamber",
  });
  expect(response.status).toBe(201);
  return domainBody(response) as { id: string };
}

describe("council meeting invariants", () => {
  it("computes the three clear days of a second notice from local calendar dates", () => {
    expect(hasThreeClearDays("2026-09-10T23:59:00+02:00", "2026-09-14T00:00:00+02:00")).toBe(true);
    expect(hasThreeClearDays("2026-09-10T00:01:00+02:00", "2026-09-13T23:59:00+02:00")).toBe(false);
    expect(hasThreeClearDays("2026-09-10T12:00:00+02:00", "2026-09-09T18:30:00+02:00")).toBe(false);
    expect(hasThreeClearDays("2026-03-27T23:30:00+01:00", "2026-03-31T00:00:00+02:00")).toBe(true);
  });

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
    expect(domainBody(rejectedAttendance).code).toBe("council_member_not_found");

    const firstAttendance = await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: first.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
    expect(domainBody(firstAttendance).version).toBe(1);
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
    expect(domainBody(updatedAttendance).version).toBe(2);
    const staleUpdate = await agent.put(`/api/council-meetings/${meeting.id}/attendance`).send({
      memberId: first.id,
      status: "present",
      proxyHolderMemberId: null,
      proxyDocumentId: null,
      expectedVersion: 1,
    });
    expect(staleUpdate.status).toBe(409);
    expect(domainBody(staleUpdate).code).toBe("conflict");
    const aggregate = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(domainBody(aggregate).rosterMemberIds).toHaveLength(3);
    expect(domainBody(aggregate).quorum).toMatchObject({
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
    const business = await agent
      .post("/api/council-business")
      .send({
        kind: "matter",
        title: "Information",
        report: "",
      })
      .expect(201);
    await agent
      .post(`/api/council-business/${domainBody(business).id}/schedule`)
      .send({ meetingId: meeting.id, position: 1 })
      .expect(201);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: first.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
    const incompleteFailure = await agent.post(`/api/council-meetings/${meeting.id}/quorum-failure`);
    expect(incompleteFailure.status).toBe(409);
    expect(domainBody(incompleteFailure).code).toBe("attendance_incomplete");
    for (const memberId of [second.id, third.id]) {
      const absentAttendance = await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId, status: "absent", proxyHolderMemberId: null, proxyDocumentId: null });
      expect(absentAttendance.status, JSON.stringify(domainBody(absentAttendance))).toBe(200);
    }

    const reconvenedInput = {
      startsAt: "2026-09-14T00:00:00+02:00",
      meetingNoticeSentAt: "2026-09-10T23:59:00+02:00",
      location: "Council chamber",
    };
    const prematureReconvocation = await agent
      .post(`/api/council-meetings/${meeting.id}/reconvene`)
      .send(reconvenedInput);
    expect(prematureReconvocation.status).toBe(409);
    expect(domainBody(prematureReconvocation).code).toBe("invalid_meeting_transition");

    const failure = await agent.post(`/api/council-meetings/${meeting.id}/quorum-failure`).expect(201);
    expect(domainBody(failure).quorumFailure).toMatchObject({
      rosterMemberIds: expect.arrayContaining([first.id, second.id, third.id]),
      quorum: { activeMembers: 3, physicallyPresent: 1, required: 2, reached: false },
    });
    await agent
      .post(`/api/council-meetings/${meeting.id}/reconvene`)
      .send({ ...reconvenedInput, startsAt: "2026-09-13T23:59:00+02:00" })
      .expect(409);
    await agent
      .post(`/api/council-meetings/${meeting.id}/reconvene`)
      .send({ ...reconvenedInput, startsAt: "2026-09-09T18:30:00+02:00" })
      .expect(409);
    await agent
      .post(`/api/council-meetings/${meeting.id}/reconvene`)
      .send({
        ...reconvenedInput,
        meetingNoticeSentAt: "2020-01-01T12:00:00+01:00",
        startsAt: "2026-09-14T00:00:00+02:00",
      })
      .expect(409);

    const lateBusiness = await agent
      .post("/api/council-business")
      .send({ kind: "openQuestion", title: "Late information", report: "" })
      .expect(201);

    const [lateAgenda, reconvened] = await Promise.all([
      agent
        .post(`/api/council-business/${domainBody(lateBusiness).id}/schedule`)
        .send({ meetingId: meeting.id, position: 2 }),
      agent.post(`/api/council-meetings/${meeting.id}/reconvene`).send(reconvenedInput),
    ]);
    expect(lateAgenda.status).toBe(409);
    expect(domainBody(lateAgenda).code).toBe("agenda_inconsistent");
    expect(reconvened.status).toBe(201);
    expect(domainBody(reconvened)).toMatchObject({
      status: "scheduled",
      isReconvenedMeeting: true,
      previousMeetingId: meeting.id,
    });
    expect(typeof domainBody(reconvened).id, JSON.stringify(domainBody(reconvened))).toBe("string");

    const aggregate = await agent.get(`/api/council-meetings/${domainBody(reconvened).id}`).expect(200);
    expect(domainBody(aggregate).rosterMemberIds).toHaveLength(3);
    expect(domainBody(aggregate).agendaItems).toHaveLength(1);
    expect(domainBody(aggregate).quorum.reached).toBe(true);
    const previous = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(domainBody(previous).meeting.status).toBe("closed");
    expect(domainBody(previous).meeting.quorumFailure.recordedAt).toBeTruthy();
    expect(domainBody(previous).agendaItems[0]).toMatchObject({ status: "postponed" });
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
    expect(incompleteAttendance.status, JSON.stringify(domainBody(incompleteAttendance))).toBe(409);
    expect(domainBody(incompleteAttendance).code).toBe("attendance_incomplete");

    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: third.id, status: "absent", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);

    const missingOfficers = await agent
      .put(`/api/council-meetings/${meeting.id}/status`)
      .send({ status: "inProgress" });
    expect(missingOfficers.status, JSON.stringify(domainBody(missingOfficers))).toBe(409);
    expect(domainBody(missingOfficers).code).toBe("meeting_officers_required");

    await agent
      .put(`/api/council-meetings/${meeting.id}/officers`)
      .send({ chairMemberId: chair.id, secretaryMemberId: secretary.id })
      .expect(200);
    const opened = await agent
      .put(`/api/council-meetings/${meeting.id}/status`)
      .send({ status: "inProgress" })
      .expect(200);
    expect(domainBody(opened)).toMatchObject({ chairMemberId: chair.id, secretaryMemberId: secretary.id });
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
    expect(opened.status, JSON.stringify(domainBody(opened))).toBe(409);
    expect(domainBody(opened).code).toBe("meeting_officers_required");
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
        startsAt: "2026-09-14T18:30:00+02:00",
        meetingNoticeSentAt: "2026-09-10T18:30:00+02:00",
        location: "Council chamber",
        chairMemberId: chair.id,
        secretaryMemberId: secretary.id,
      })
      .expect(201);

    const opened = await agent
      .put(`/api/council-meetings/${domainBody(reconvened).id}/status`)
      .send({ status: "inProgress" });
    expect(opened.status, JSON.stringify(domainBody(opened))).toBe(409);
    expect(domainBody(opened).code).toBe("attendance_incomplete");
  });

  it("returns proxy_invalid when one member would carry two proxies", async () => {
    const { agent, container } = await createTestServer();
    const holder = await createMember(agent, "Alice");
    const firstPrincipal = await createMember(agent, "Benoît");
    const secondPrincipal = await createMember(agent, "Claire");
    const secondHolder = await createMember(agent, "David");
    const stalePrincipal = await createMember(agent, "Élodie");
    const meeting = await createMeeting(agent);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: holder.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: secondHolder.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: stalePrincipal.id, status: "absent", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
    await expect(
      container.cradle.meetingPreparationService.recordAttendance(meeting.id, {
        memberId: secondPrincipal.id,
        status: "represented",
        proxyHolderMemberId: holder.id,
        proxyDocumentId: null,
      }),
    ).rejects.toMatchObject({ code: "proxy_invalid", statusCode: 400 });
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({
        memberId: stalePrincipal.id,
        status: "excused",
        proxyHolderMemberId: null,
        proxyDocumentId: null,
        expectedVersion: 1,
      })
      .expect(200);
    const uploadProxy = (filename: string) =>
      agent
        .post("/api/resources/documents")
        .field("meetingId", meeting.id)
        .field("category", "proxy")
        .attach("file", Buffer.from("%PDF-1.7\nWritten proxy"), {
          filename,
          contentType: "application/pdf",
        });
    const firstDocument = await uploadProxy("proxy-first.pdf");
    const secondDocument = await uploadProxy("proxy-second.pdf");
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({
        memberId: firstPrincipal.id,
        status: "represented",
        proxyHolderMemberId: holder.id,
        proxyDocumentId: domainBody(firstDocument).id,
      })
      .expect(200);
    const staleProxyUpdate = await agent.put(`/api/council-meetings/${meeting.id}/attendance`).send({
      memberId: stalePrincipal.id,
      status: "represented",
      proxyHolderMemberId: holder.id,
      proxyDocumentId: domainBody(secondDocument).id,
      expectedVersion: 1,
    });
    expect(staleProxyUpdate.status).toBe(409);
    expect(domainBody(staleProxyUpdate).code).toBe("conflict");
    const duplicate = await agent.put(`/api/council-meetings/${meeting.id}/attendance`).send({
      memberId: secondPrincipal.id,
      status: "represented",
      proxyHolderMemberId: holder.id,
      proxyDocumentId: domainBody(secondDocument).id,
    });
    expect(duplicate.status).toBe(400);
    expect(domainBody(duplicate).code).toBe("proxy_invalid");
    const reusedWrittenProxy = await agent.put(`/api/council-meetings/${meeting.id}/attendance`).send({
      memberId: secondPrincipal.id,
      status: "represented",
      proxyHolderMemberId: secondHolder.id,
      proxyDocumentId: domainBody(firstDocument).id,
    });
    expect(reusedWrittenProxy.status).toBe(400);
    expect(domainBody(reusedWrittenProxy).code).toBe("proxy_invalid");
  });

  it("translates persistence conflicts into a stable API error", async () => {
    const { agent } = await createTestServer();
    const decision = await agent
      .post("/api/council-decisions")
      .send({ title: "Unique business decision", draftText: "", legalityReviewRequired: false })
      .expect(201);
    const business = {
      kind: "matter",
      councilDecisionId: domainBody(decision).id,
      title: "Unique decision business",
      report: "",
    };
    await agent.post("/api/council-business").send(business).expect(201);
    const duplicate = await agent.post("/api/council-business").send(business);
    expect(duplicate.status).toBe(409);
    expect(domainBody(duplicate)).toMatchObject({ code: "workspace_title_conflict", status: 409 });
  });

  it("protects the administrative API when development access is disabled", async () => {
    const { agent } = await createTestServer({ devAutoLogin: false });
    await agent.get("/api/health").expect(200);
    const unauthorized = await agent.get("/api/council-members");
    expect(unauthorized.status).toBe(401);
    expect(domainBody(unauthorized).code).toBe("authentication_required");
  });

  it("rejects a non-loopback listener without authentication and a TLS proxy", () => {
    expect(() =>
      validateServerConfig({ host: "0.0.0.0", port: 3100, database: { kind: "postgres", url: "postgresql://unused.example/hall" } }),
    ).toThrow();
    expect(() =>
      validateServerConfig({
        host: "0.0.0.0",
        port: 3100,
        database: { kind: "postgres", url: "postgresql://unused.example/hall" },
        behindTlsProxy: true,
        bootstrapToken: "jeton-initialisation-partage-2026",
      }),
    ).not.toThrow();
  });
});
