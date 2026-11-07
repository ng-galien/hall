import { jinjaBody } from "@hall/domain";
import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createDocumentRenderer } from "../services/documentRenderer.js";
import { createTestServer, domainBody } from "./testServer.js";

// @verifies-requirement HALL-FR-MIN-270
describe("list of deliberations examined in a closed meeting", () => {
  it("lists each examined item with its number, title and outcome, only once the meeting is closed", async () => {
    const renderer = createDocumentRenderer();
    const renderedHtml: string[] = [];
    const { agent, container } = await createTestServer({
      realClients: true,
      documentRenderer: {
        ...renderer,
        async pdf(input) {
          renderedHtml.push(input.html);
          return renderer.pdf(input);
        },
      },
    });
    const base = Math.floor(Date.now() / 60_000) * 60_000 - 2 * 3_600_000;
    const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
    const pool = container.cradle.postgresPool;
    if (!pool) throw new Error("A PostgreSQL pool is required for the closed meeting scenario");
    const databaseRequest = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "deliberation-list", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await pool.query("UPDATE public.hall_settings SET name='Commune témoin',time_zone='Europe/Paris' WHERE id='hall'");
    await new PostgresDirectory(pool).configureActiveCouncilTerm(databaseRequest, 1);
    const contact = domainBody<{ id: string }>(
      await agent.post("/api/contacts").send({ firstName: "Martine", lastName: "Test" }).expect(201),
    );
    const member = domainBody<{ id: string }>(
      await agent
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "mayor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    await agent
      .post("/api/templates")
      .send({
        kind: "pdf",
        documentType: "deliberation-list",
        name: "Liste",
        bodyMarkdown: jinjaBody("deliberation-list"),
      })
      .expect(201);
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    const schedule = async (kind: "councilDecisionProposal" | "openQuestion", name: string, position: number) => {
      const business = domainBody<{ id: string }>(
        await agent
          .post("/api/council-business")
          .send({ path: "seed", name, reportName: "Rapport", reportContent: "" })
          .expect(201),
      );
      const subject = domainBody<{ id: string }>(
        await agent
          .post(`/api/council-business/${business.id}/prepared-subjects`)
          .send({ kind, name, content: "Texte" })
          .expect(201),
      );
      return domainBody<{ id: string }>(
        await agent
          .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
          .send({ kind, subjectId: subject.id, position })
          .expect(201),
      );
    };
    const adopted = await schedule("councilDecisionProposal", "Éclairage public", 1);
    const rejected = await schedule("councilDecisionProposal", "Vente du presbytère", 2);
    const question = await schedule("openQuestion", "Compte rendu des décisions du maire", 3);
    await agent
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: at(0),
        location: "Salle du conseil",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
      })
      .expect(200);
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(databaseRequest, meeting.id);
    const noticeFacts = await council.noticeFacts(databaseRequest, meeting.id);
    if (!noticeFacts) throw new Error("Frozen meeting notice facts are required");
    await council.generateNotice(
      databaseRequest,
      meeting.id,
      { meeting: noticeFacts, issuedOn: null, hall: { name: "Commune témoin", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        chairMemberId: member.id,
        secretaryMemberId: member.id,
        attendance: [{ councilMemberId: member.id, status: "present" }],
      })
      .expect(200);

    const openMeeting = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(openMeeting.body.links.map((link: { rel: string[] }) => link.rel[0])).not.toContain("deliberation-list");
    await agent.get(`/api/council-meetings/${meeting.id}/deliberation-list.pdf`).expect(409);

    const attendance = await council.listAttendance(databaseRequest, meeting.id);
    const vote = async (item: { id: string }, choice: "approve" | "reject") => {
      await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`).send({}).expect(200);
      const preview = domainBody<{ id: string }>(
        await agent
          .post("/api/ballot-previews")
          .send({
            agendaItemId: item.id,
            candidate: {
              procedure: "ordinaryMajority",
              mode: "public",
              participantAttendanceIds: [attendance[0]!.id],
              votes: [{ meetingAttendanceId: attendance[0]!.id, choice }],
              nonParticipations: [],
            },
          })
          .expect(201),
      );
      await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(200);
    };
    await vote(adopted, "approve");
    await vote(rejected, "reject");
    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${question.id}/start`).send({}).expect(200);
    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${question.id}/complete`).send({}).expect(200);
    const closure = await agent.post(`/api/council-meetings/${meeting.id}/close`).send({});
    expect(closure.status, JSON.stringify(closure.body)).toBe(200);

    const closed = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(closed.body.links).toContainEqual({
      rel: ["deliberation-list"],
      href: expect.stringMatching(/\/deliberation-list\.pdf$/),
      type: "application/pdf",
    });
    const pdf = await agent
      .get(`/api/council-meetings/${meeting.id}/deliberation-list.pdf`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    expect((await PDFDocument.load(pdf.body)).getPageCount()).toBeGreaterThan(0);
    const html = renderedHtml.at(-1)!;
    expect(html).toContain("Commune témoin");
    expect(html).toContain("Liste des délibérations examinées");
    expect(html).toContain(
      new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(
        new Date(closed.body.properties.startedAt),
      ),
    );
    const rows = [...html.matchAll(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map((row) =>
      row.slice(1),
    );
    expect(rows).toEqual([
      ["1", "Éclairage public", "Adoptée"],
      ["2", "Vente du presbytère", "Rejetée"],
      ["3", "Compte rendu des décisions du maire", "Sans vote"],
    ]);
  });
});
