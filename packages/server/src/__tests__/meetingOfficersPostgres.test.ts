if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required; use the isolated test:postgres entry point");

import { agendaItemRecusalsSchema, ballotResultPreviewSchema, meetingConductWorkspaceSchema } from "@hall/api-contract";
import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { startHttpServer } from "../server.js";
import { resetPostgresTestDatabase } from "./support/postgresTestDatabase.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

// @verifies-requirement HALL-FR-MTG-330
// @verifies-requirement HALL-FR-MTG-340
// @verifies-requirement HALL-FR-ATT-140
// @verifies-requirement HALL-FR-BAL-140
// @verifies-requirement HALL-FR-BAL-340
it("conducts handovers through the form, attending persons and the ballot chair through Siren actions", async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  await resetPostgresTestDatabase(pool);
  const server = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    database: { kind: "postgres", url: databaseUrl! },
    environment: "test",
    devAutoLogin: false,
  });
  try {
    const bootstrap = await fetch(`${server.url}/api/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: server.url },
      body: JSON.stringify({
        email: "admin@example.fr",
        displayName: "Administrator",
        password: "Test-administrator-2026!",
      }),
    });
    expect(bootstrap.status).toBe(201);
    const cookie = bootstrap.headers.get("set-cookie")!.split(";", 1)[0];
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "setup", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    const directory = new PostgresDirectory(pool);
    const council = new PostgresCouncil(pool);
    await directory.configureActiveCouncilTerm(context, 3);
    const person = (firstName: string, lastName: string) =>
      directory.createContact(context, {
        firstName,
        lastName,
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      });
    const mayorContact = await person("Marie", "Maire");
    const mayor = await directory.createCouncilMember(context, {
      contactId: mayorContact.id,
      role: "mayor",
      termStartedOn: "2020-01-01",
    });
    const deputy = await directory.createCouncilMember(context, {
      contactId: (await person("Paul", "Adjoint")).id,
      role: "deputyMayor",
      termStartedOn: "2020-01-01",
    });
    const councillor = await directory.createCouncilMember(context, {
      contactId: (await person("Lise", "Conseillère")).id,
      role: "councillor",
      termStartedOn: "2020-01-01",
    });
    const secretaryOfTownHall = await person("Claire", "Martin");
    const send = async (path: string, body: unknown, status = 200, method = "POST") => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        headers: { "content-type": "application/json", origin: server.url, cookie },
        body: method === "GET" ? undefined : JSON.stringify(body),
      });
      const payload = await response.json();
      expect(response.status, JSON.stringify(payload)).toBe(status);
      return payload;
    };
    const meeting = (await send("/api/council-meetings", {}, 201)).properties;
    await send(
      `/api/council-meetings/${meeting.id}/prepare`,
      {
        scheduledAt: "2026-01-01T09:00:00Z",
        location: "Chamber",
        chairMemberId: mayor.id,
        secretaryMemberId: councillor.id,
      },
      200,
      "PUT",
    );
    const business = await council.createBusiness(context, {
      path: "seed",
      name: "Compte financier unique",
      reportName: "Report",
      reportContent: "",
    });
    const item = await council.scheduleDecisionProposal(context, {
      councilMeetingId: meeting.id,
      councilBusinessId: business.id,
      position: 1,
    });
    await council.freezeAgenda(context, meeting.id);
    const facts = await council.noticeFacts(context, meeting.id);
    if (!facts) throw new Error("Frozen fixture notice facts are required");
    await council.generateNotice(
      context,
      meeting.id,
      { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await send(`/api/council-meetings/${meeting.id}/record-opening`, {
      observedAt: "2026-01-01T09:00:00Z",
      chairMemberId: mayor.id,
      secretaryMemberId: councillor.id,
      attendance: [mayor, deputy, councillor].map((member) => ({ councilMemberId: member.id, status: "present" })),
    });

    const opened = await send(`/api/council-meetings/${meeting.id}/conduct`, undefined, 200, "GET");
    const conduct = meetingConductWorkspaceSchema.parse(opened.properties);
    expect(conduct.officerHandoverOptions.chair.map((option) => option.councilMemberId).sort()).toEqual(
      [deputy.id, councillor.id].sort(),
    );
    expect(opened.actions.map((action: { name: string }) => action.name)).toEqual(
      expect.arrayContaining([
        "meeting.record-officer-change",
        "meeting.declare-auxiliary-attendance",
        "meeting.correct-auxiliary-attendance",
      ]),
    );

    const refused = await send(
      `/api/council-meetings/${meeting.id}/officer-changes`,
      { office: "chair", councilMemberId: mayor.id, observedAt: new Date().toISOString() },
      409,
    );
    expect(refused.code).toBe("meeting_officer_change_invalid");
    const handed = meetingConductWorkspaceSchema.parse(
      (
        await send(
          `/api/council-meetings/${meeting.id}/officer-changes`,
          { office: "secretary", councilMemberId: deputy.id, observedAt: new Date().toISOString() },
          201,
        )
      ).properties,
    );
    expect(handed.currentOfficers).toEqual({ chairMemberId: mayor.id, secretaryMemberId: deputy.id });
    expect(handed.officerChanges).toEqual([
      expect.objectContaining({ office: "secretary", basis: "councilNomination", memberName: "Paul Adjoint" }),
    ]);

    const auxiliariesPath = `/api/council-meetings/${meeting.id}/auxiliary-attendances`;
    const declared = meetingConductWorkspaceSchema.parse(
      (
        await send(
          auxiliariesPath,
          {
            person: { kind: "contact", contactId: secretaryOfTownHall.id },
            quality: "secrétaire de mairie",
            declaredAt: new Date().toISOString(),
          },
          201,
        )
      ).properties,
    );
    expect(declared.auxiliaryAttendances).toEqual([
      expect.objectContaining({ name: "Claire Martin", quality: "secrétaire de mairie" }),
    ]);
    expect(declared.currentAttendance).toHaveLength(3);
    const withNewContact = meetingConductWorkspaceSchema.parse(
      (
        await send(
          auxiliariesPath,
          {
            person: { kind: "newContact", firstName: "Jean", lastName: "Libre" },
            quality: "",
            declaredAt: new Date().toISOString(),
          },
          201,
        )
      ).properties,
    );
    const created = withNewContact.auxiliaryAttendances.find((entry) => entry.name === "Jean Libre")!;
    expect(created.quality).toBeNull();
    const corrected = meetingConductWorkspaceSchema.parse(
      (await send(auxiliariesPath, { kind: "quality", attendanceId: created.id, quality: "invité" }, 200, "PATCH"))
        .properties,
    );
    expect(corrected.auxiliaryAttendances.find((entry) => entry.id === created.id)?.quality).toBe("invité");
    const removed = meetingConductWorkspaceSchema.parse(
      (await send(auxiliariesPath, { kind: "removal", attendanceId: created.id }, 200, "PATCH")).properties,
    );
    expect(removed.auxiliaryAttendances.map((entry) => entry.name)).toEqual(["Claire Martin"]);
    const member = await send(
      auxiliariesPath,
      { person: { kind: "contact", contactId: mayorContact.id }, quality: null, declaredAt: new Date().toISOString() },
      409,
    );
    expect(member.code).toBe("auxiliary_attendance_invalid");

    const recusalsPath = `/api/council-meetings/${meeting.id}/agenda-items/${item.id}/recusals`;
    await send(
      recusalsPath,
      { councilMemberId: mayor.id, legalBasis: "personalInterest", declaredAt: new Date().toISOString() },
      201,
    );
    await send(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`, {
      startedAt: new Date().toISOString(),
    });
    const state = agendaItemRecusalsSchema.parse((await send(recusalsPath, undefined, 200, "GET")).properties);
    expect(state.ballotChair).toMatchObject({ councilMemberId: mayor.id, recused: true });
    const attendance = await council.listAttendance(context, meeting.id);
    const attendanceOf = (memberId: string) => attendance.find((entry) => entry.councilMemberId === memberId)!.id;
    const candidate = {
      procedure: "ordinaryMajority",
      mode: "public",
      participantAttendanceIds: [attendanceOf(deputy.id), attendanceOf(councillor.id)],
      votes: [
        { meetingAttendanceId: attendanceOf(deputy.id), choice: "approve" },
        { meetingAttendanceId: attendanceOf(councillor.id), choice: "reject" },
      ],
      nonParticipations: [],
    };
    const blocked = await send("/api/ballot-previews", { agendaItemId: item.id, candidate }, 409);
    expect(blocked.code).toBe("ballot_officers_not_present");
    const assigned = meetingConductWorkspaceSchema.parse(
      (
        await send(
          `/api/council-meetings/${meeting.id}/officer-changes`,
          { office: "chair", councilMemberId: councillor.id, observedAt: new Date().toISOString() },
          201,
        )
      ).properties,
    );
    expect(assigned.currentOfficers.chairMemberId).toBe(councillor.id);
    await send(
      "/api/ballot-previews",
      { agendaItemId: item.id, candidate: { ...candidate, chairmanAttendanceId: attendanceOf(deputy.id) } },
      400,
    );
    const preview = ballotResultPreviewSchema.parse(
      (await send("/api/ballot-previews", { agendaItemId: item.id, candidate }, 201)).properties,
    );
    expect(preview.candidate.chairmanAttendanceId).toBe(attendanceOf(councillor.id));
    expect(preview.calculation).toMatchObject({ tieBreakApplied: true, result: "reject" });
  } finally {
    await server.close();
    await pool.end();
  }
});
