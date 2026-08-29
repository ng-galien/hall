import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildContainer } from "../core/container.js";
import { startHttpServer } from "../server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;

postgres("PostgreSQL persistence", () => {
  it("serializes schema bootstrap across concurrent server instances", async () => {
    const setup = new Pool({ connectionString: databaseUrl });
    await setup.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await setup.end();

    const config = {
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres" as const, url: databaseUrl! },
      environment: "test",
    };
    const first = buildContainer(config);
    const second = buildContainer(config);
    try {
      await Promise.all([first.cradle.sqlExecutor.ready(), second.cradle.sqlExecutor.ready()]);
    } finally {
      await Promise.all([first.cradle.sqlExecutor.close(), second.cradle.sqlExecutor.close()]);
    }
  });

  it("closes the PostgreSQL pool when the HTTP listener cannot start", async () => {
    const setup = new Pool({ connectionString: databaseUrl });
    await setup.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await setup.end();
    const initialized = buildContainer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
    });
    await initialized.cradle.sqlExecutor.ready();
    await initialized.cradle.sqlExecutor.close();

    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("Expected an occupied TCP port");
    const applicationName = `hall-startup-review-${randomUUID()}`;
    const url = new URL(databaseUrl!);
    url.searchParams.set("application_name", applicationName);
    try {
      await expect(
        startHttpServer({
          host: "127.0.0.1",
          port: address.port,
          database: { kind: "postgres", url: url.toString() },
          environment: "test",
        }),
      ).rejects.toMatchObject({ code: "EADDRINUSE" });

      const inspection = new Pool({ connectionString: databaseUrl });
      const active = await inspection.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM pg_stat_activity WHERE application_name = $1",
        [applicationName],
      );
      await inspection.end();
      expect(Number(active.rows[0]?.count ?? 0)).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        occupied.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
    }
  });

  it("runs the council workflow through the PostgreSQL adapter", async () => {
    const setup = new Pool({ connectionString: databaseUrl });
    await setup.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await setup.end();

    const container = buildContainer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
    });
    const {
      sqlExecutor,
      agendaItemRepository,
      councilMemberRepository,
      councilDecisionRepository,
      councilMeetingService,
      meetingPreparationService,
      meetingLifecycleService,
      meetingAgendaService,
      ballotService,
      resourceRepository,
      councilBusinessService,
      councilCommitteeRepository,
      committeeMembershipRepository,
      securityRepository,
      hallSettingsService,
      contentTemplateRepository,
    } = container.cradle;
    await sqlExecutor.ready();
    try {
      const hallSettings = await hallSettingsService.update({
        name: "Saint-Aubin",
        inseeCode: "12345",
        siren: "123456789",
        population: 2_500,
        populationReferenceDate: "2026-01-01",
        addressLine1: "1 place de la Mairie",
        addressLine2: "",
        postalCode: "12345",
        city: "Saint-Aubin",
        phone: "+33 1 23 45 67 89",
        email: "contact@saint-aubin.fr",
        website: "https://saint-aubin.fr",
        defaultMeetingLocation: "Salle du conseil",
        timeZone: "Europe/Paris",
        outboundEmailSenderName: "Conseil municipal de Saint-Aubin",
        outboundEmailSenderAddress: "conseil@saint-aubin.fr",
        outboundEmailReplyToAddress: "secretariat@saint-aubin.fr",
      });
      expect(await hallSettingsService.get()).toEqual(hallSettings);

      const contentTemplate = await contentTemplateRepository.create({
        kind: "message",
        documentType: "meeting-notice-message",
        name: "Meeting notice",
        bodyMarkdown: "Council meeting",
        subject: "Notice",
        stylesheet: "",
        headerHtml: "",
        footerHtml: "",
      });
      expect(await contentTemplateRepository.find(contentTemplate.id)).toEqual(contentTemplate);

      const members = await Promise.all(
        ["Alice", "Benoît", "Claire"].map((firstName) =>
          councilMemberRepository.create({
            firstName,
            lastName: "Martin",
            role: "councillor",
            termStartedOn: "2026-03-22",
          }),
        ),
      );
      const committee = await councilCommitteeRepository.create({
        name: "Finance committee",
        description: "Prepares financial matters",
      });
      const membership = await committeeMembershipRepository.add(committee.id, {
        councilMemberId: members[0].id,
        role: "chair",
        startedOn: "2026-03-22",
      });
      expect(await councilCommitteeRepository.find(committee.slug)).toEqual(committee);
      expect(await committeeMembershipRepository.listForCommittee(committee.id)).toEqual([membership]);

      const text = await resourceRepository.createText({
        title: "Summary",
        folderPath: "associations/grants",
        tags: ["finance", "grant"],
        content: "Working note",
      });
      const documentContent = Buffer.from("pdf");
      const contentSha256 = createHash("sha256").update(documentContent).digest("hex");
      const document = await resourceRepository.createDocument({
        title: "Report",
        folderPath: "associations/grants",
        tags: ["finance"],
        fileName: "report.pdf",
        format: "pdf",
        mediaType: "application/pdf",
        contentSha256,
        category: "report",
        content: documentContent,
      });
      expect(text.slug).toBe("summary");
      expect(document.slug).toBe("report");
      expect(await resourceRepository.list({ tags: ["finance"] })).toHaveLength(2);
      expect(await resourceRepository.find(document.id)).toMatchObject({
        id: document.id,
        format: "pdf",
        mediaType: "application/pdf",
        contentSha256,
        content: documentContent,
      });
      const previewContent = Buffer.from("%PDF-1.7\npreview");
      const preview = await resourceRepository.savePreview({
        sourceContentSha256: contentSha256,
        sourceFormat: "docx",
        contentSha256: createHash("sha256").update(previewContent).digest("hex"),
        byteSize: previewContent.byteLength,
        content: previewContent,
        createdAt: new Date().toISOString(),
      });
      expect(await resourceRepository.findPreview(contentSha256, "docx")).toEqual(preview);

      const decision = await councilDecisionRepository.create({
        title: "Grant decision",
        draftText: "The council decides...",
        legalityReviewRequired: true,
      });
      expect(decision).toMatchObject({ number: null, slug: "grant-decision" });
      const meeting = await councilMeetingService.createMeeting({
        startsAt: "2026-09-10T18:30:00+02:00",
        location: "Council chamber",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      });
      expect(meeting).toMatchObject({
        number: "2026-001",
        slug: "2026-09-10-001",
      });
      const business = await councilBusinessService.create({
        kind: "matter",
        committeeId: committee.id,
        councilDecisionId: decision.id,
        title: decision.title,
        report: "Grant report",
        folderPath: "associations/grants",
        resourceIds: [text.id, document.id],
      });
      expect(business).toMatchObject({ committeeId: committee.id });
      const agendaItem = await meetingPreparationService.scheduleBusiness(meeting.id, business.id, 1);
      await meetingLifecycleService.changeStatus(meeting.id, "scheduled");
      for (const member of members) {
        await meetingPreparationService.recordAttendance(meeting.id, { memberId: member.id, status: "present" });
      }
      await meetingLifecycleService.changeStatus(meeting.id, "inProgress");
      await meetingAgendaService.startItem(meeting.id, agendaItem.id);
      const ballot = await ballotService.recordBallot(meeting.id, {
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: decision.id,
        votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
      });
      expect(ballot).toMatchObject({ result: "adopted", votesFor: 3 });
      expect(await councilDecisionRepository.find(decision.id)).toMatchObject({
        number: null,
        slug: "grant-decision",
        status: "adopted",
      });
      await meetingAgendaService.completeItem(meeting.id, agendaItem.id, {
        discussionSummary: "Adopted unanimously",
        status: "examined",
      });
      expect(await councilDecisionRepository.find(decision.id)).toMatchObject({
        number: "2026-001",
        slug: "grant-decision",
        status: "adopted",
      });
      await meetingLifecycleService.changeStatus(meeting.id, "closed");
      expect(await meetingLifecycleService.finalizeMinutesDraft(meeting.id)).toMatchObject({
        minutesStatus: "ready",
      });
      const automaticallyPreparedMeeting = await councilMeetingService.createMeeting({
        startsAt: "2026-09-20T18:30:00+02:00",
        location: "Council chamber",
      });
      const automaticallyPreparedAgenda = await agendaItemRepository.listForMeeting(automaticallyPreparedMeeting.id);
      expect(automaticallyPreparedAgenda).toHaveLength(1);
      expect(automaticallyPreparedAgenda[0]?.business).toMatchObject({
        kind: "minutesApproval",
        minutesOfMeetingId: meeting.id,
      });

      const secondContainer = buildContainer({
        host: "127.0.0.1",
        port: 0,
        database: { kind: "postgres", url: databaseUrl! },
        environment: "test",
      });
      await secondContainer.cradle.sqlExecutor.ready();
      try {
        const concurrentAttendance = await Promise.all([
          container.cradle.attendanceRepository.record(meeting.id, {
            memberId: members[2].id,
            status: "present",
            expectedVersion: 1,
          }),
          secondContainer.cradle.attendanceRepository.record(meeting.id, {
            memberId: members[2].id,
            status: "present",
            expectedVersion: 1,
          }),
        ]);
        expect(concurrentAttendance.map((result) => result.status).sort()).toEqual(["recorded", "versionConflict"]);
      } finally {
        await secondContainer.cradle.sqlExecutor.close();
      }
      expect(
        await container.cradle.attendanceRepository.record(meeting.id, {
          memberId: members[1].id,
          status: "represented",
          proxyHolderMemberId: members[0].id,
          expectedVersion: 1,
        }),
      ).toMatchObject({ status: "recorded" });
      expect(
        await container.cradle.attendanceRepository.record(meeting.id, {
          memberId: members[2].id,
          status: "represented",
          proxyHolderMemberId: members[0].id,
          expectedVersion: 2,
        }),
      ).toEqual({ status: "proxyHolderConflict" });

      const user = await securityRepository.createUser({
        email: "clerk@hall.test",
        displayName: "Council clerk",
        passwordHash: "test-hash",
        roles: ["clerk"],
        councilMemberId: null,
      });
      const session = await securityRepository.createSession(user.id, "token-hash", "2099-01-01T00:00:00Z");
      expect(await securityRepository.findSession("token-hash")).toEqual(session);
      await securityRepository.recordAuditEvent({
        actorUserId: user.id,
        requestId: randomUUID(),
        action: "test.postgres",
        targetType: "meeting",
        targetId: meeting.id,
        outcome: "succeeded",
        details: { dialect: "postgres" },
      });
      expect(await securityRepository.listAuditEvents()).toHaveLength(1);

      const schedulingMeetings = await Promise.all(
        [0, 1].map((index) =>
          councilMeetingService.createMeeting({
            startsAt: `2026-10-${10 + index}T18:30:00+02:00`,
            location: "Council chamber",
            chairMemberId: members[0].id,
            secretaryMemberId: members[1].id,
          }),
        ),
      );
      const concurrentlyScheduledBusiness = await councilBusinessService.create({
        kind: "openQuestion",
        title: "One business, one meeting",
        report: "",
        folderPath: "",
        resourceIds: [],
      });
      const schedulingContainer = buildContainer({
        host: "127.0.0.1",
        port: 0,
        database: { kind: "postgres", url: databaseUrl! },
        environment: "test",
      });
      await schedulingContainer.cradle.sqlExecutor.ready();
      try {
        const concurrentScheduling = await Promise.allSettled([
          container.cradle.meetingPreparationService.scheduleBusiness(
            schedulingMeetings[0].id,
            concurrentlyScheduledBusiness.id,
            1,
          ),
          schedulingContainer.cradle.meetingPreparationService.scheduleBusiness(
            schedulingMeetings[1].id,
            concurrentlyScheduledBusiness.id,
            1,
          ),
        ]);
        expect(concurrentScheduling.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
        const scheduledOccurrences = await Promise.all(
          schedulingMeetings.map((target) => container.cradle.agendaItemRepository.listForMeeting(target.id)),
        );
        expect(scheduledOccurrences.flat()).toHaveLength(1);
      } finally {
        await schedulingContainer.cradle.sqlExecutor.close();
      }

      const administrators = await Promise.all(
        ["first-admin@hall.test", "second-admin@hall.test"].map((email) =>
          securityRepository.createUser({
            email,
            displayName: email,
            passwordHash: "test-hash",
            roles: ["administrator"],
            councilMemberId: null,
          }),
        ),
      );
      const competingContainer = buildContainer({
        host: "127.0.0.1",
        port: 0,
        database: { kind: "postgres", url: databaseUrl! },
        environment: "test",
      });
      await competingContainer.cradle.sqlExecutor.ready();
      try {
        const concurrentRoleRemoval = await Promise.allSettled([
          container.cradle.authService.assignRoles(administrators[0].id, ["reader"]),
          competingContainer.cradle.authService.assignRoles(administrators[1].id, ["reader"]),
        ]);
        expect(concurrentRoleRemoval.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
        expect(await securityRepository.countActiveAdministrators()).toBe(1);

        const remainingAdministrator = (
          await Promise.all(administrators.map((administrator) => securityRepository.findUserById(administrator.id)))
        ).find((administrator) => administrator?.roles.includes("administrator"));
        if (!remainingAdministrator) throw new Error("Expected one remaining administrator");
        const otherAdministrator = await securityRepository.createUser({
          email: "third-admin@hall.test",
          displayName: "Third administrator",
          passwordHash: "test-hash",
          roles: ["administrator"],
          councilMemberId: null,
        });
        const concurrentDisableAndRemoval = await Promise.allSettled([
          container.cradle.authService.disableUser(remainingAdministrator.id),
          competingContainer.cradle.authService.assignRoles(otherAdministrator.id, ["reader"]),
        ]);
        expect(concurrentDisableAndRemoval.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
        expect(await securityRepository.countActiveAdministrators()).toBe(1);
      } finally {
        await competingContainer.cradle.sqlExecutor.close();
      }
    } finally {
      await sqlExecutor.close();
    }
  });
});
