import { writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { startHttpServer } from "../server.js";
import { resetPostgresTestDatabase } from "./support/postgresTestDatabase.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;
postgres("meeting notice PDF and email through PostgreSQL", () => {
  it("persists the rendered agenda, attaches identical PDF bytes and saves text name/content atomically", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    await resetPostgresTestDatabase(pool);
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
      devAutoLogin: true,
    });
    const json = async (path: string, method = "GET", body?: unknown, expected = 200) => {
      const response = await fetch(server.url + "/api" + path, {
        method,
        headers: { "content-type": "application/json", origin: server.url },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      expect({ status: response.status, problem: response.status >= 400 ? result : undefined }).toEqual({
        status: expected,
        problem: expected >= 400 ? result : undefined,
      });
      return result;
    };
    try {
      await pool.query(
        "UPDATE public.hall_settings SET name='Commune témoin',population=1200,time_zone='Europe/Paris',outbound_email_sender_address='mairie@example.test' WHERE id='hall'",
      );
      await pool.query("SELECT hall_api.configure_active_council_term(15)");
      for (const [index, email] of [
        "alice@example.test",
        "benoit@example.test",
        ...Array.from({ length: 13 }, (_, i) => `member${i}@example.test`),
      ].entries()) {
        const contact = (
          await pool.query("SELECT hall_api.create_contact($1,'Martin',NULL,NULL,$2,NULL,'') contact", [
            index === 0 ? "Alice" : index === 1 ? "Benoît" : `Member ${index}`,
            email,
          ])
        ).rows[0].contact;
        await pool.query("SELECT hall_api.create_council_member($1,$2,DATE '2026-01-01')", [
          contact.id,
          index ? "councillor" : "mayor",
        ]);
      }
      for (const kind of ["pdf", "message"])
        await json(
          "/templates",
          "POST",
          {
            kind,
            name: kind,
            documentType: kind === "pdf" ? "meeting-notice" : "meeting-notice-message",
            bodyMarkdown: "::meeting-notice",
            ...(kind === "message" ? { subject: "Convocation du conseil" } : {}),
          },
          201,
        );
      const meeting = (await json("/council-meetings", "POST", {}, 201)).properties;
      const business = (
        await json(
          "/council-business",
          "POST",
          { path: "seed", name: "Éclairage public", reportName: "Rapport", reportContent: "Rapport distinct" },
          201,
        )
      ).properties;
      const subject = (
        await json(
          `/council-business/${business.id}/prepared-subjects`,
          "POST",
          { kind: "councilDecisionProposal", name: "Budget initial", content: "Texte initial" },
          201,
        )
      ).properties;
      let resource = (await json(`/resources/${subject.textResourceId}`)).properties;
      const saved = (
        await json(`/resources/${resource.id}/content`, "PUT", {
          kind: "text",
          expectedVersion: resource.version,
          name: "Budget éclairage",
          content: "Texte proposé",
        })
      ).properties;
      expect(saved).toMatchObject({
        name: "Budget éclairage",
        content: "Texte proposé",
        version: resource.version + 1,
      });
      await json(
        `/resources/${resource.id}/content`,
        "PUT",
        { kind: "text", expectedVersion: resource.version, name: "Titre périmé", content: "Obsolète" },
        409,
      );
      resource = (await json(`/resources/${resource.id}`)).properties;
      expect(resource).toMatchObject({ name: "Budget éclairage", content: "Texte proposé", version: saved.version });
      await json(
        `/council-meetings/${meeting.id}/agenda-items/from-prepared`,
        "POST",
        { kind: subject.kind, subjectId: subject.id, position: 1 },
        201,
      );
      const quickInput = {
        kind: "openQuestion",
        path: "seed",
        name: "First quick question",
        reportName: "Report",
        reportContent: "",
        position: 2,
      };
      const quick = (await json(`/council-meetings/${meeting.id}/council-business`, "POST", quickInput, 201))
        .properties;
      await json(`/council-meetings/${meeting.id}/agenda-items/${quick.agendaItem.id}`, "DELETE");
      const nextQuick = (
        await json(
          `/council-meetings/${meeting.id}/council-business`,
          "POST",
          { ...quickInput, name: "Second quick question" },
          201,
        )
      ).properties;
      expect(nextQuick.agendaItem.position).toBe(2);
      expect(
        (await pool.query("SELECT position FROM hall.council_agenda_item WHERE id=$1", [quick.agendaItem.id])).rows[0]
          .position,
      ).toBe(-3);
      await json(`/council-meetings/${meeting.id}/agenda-items/${nextQuick.agendaItem.id}`, "DELETE");
      for (const position of [2, 3, 4, 6]) {
        await json(
          `/council-meetings/${meeting.id}/council-business`,
          "POST",
          { ...quickInput, position, name: `Numbering question ${position}` },
          201,
        );
      }
      const agendaResponse = await json(`/council-meetings/${meeting.id}/agenda-items`);
      const presented = agendaResponse.entities
        .map((entry: { properties: { id: string; position: number; agendaNumber: number | null } }) => entry.properties)
        .filter((entry: { agendaNumber: number | null }) => entry.agendaNumber !== null);
      expect(presented.map((entry: { position: number }) => entry.position)).toEqual([1, 2, 3, 4, 6]);
      expect(presented.map((entry: { agendaNumber: number }) => entry.agendaNumber)).toEqual([1, 2, 3, 4, 5]);
      await pool.query(
        "SELECT hall_api.schedule_council_meeting($1,TIMESTAMPTZ '2026-09-11 18:00:00+00','Salle du conseil')",
        [meeting.id],
      );
      const before = await json(`/council-meetings/${meeting.id}`);
      expect(before.properties.noticeDeadline).toMatchObject({
        status: "qualificationRequired",
        ordinaryReference: { deadlineDate: "2026-09-07", clearDays: 3 },
      });
      expect(before.actions.map((a: { name: string }) => a.name)).not.toContain("meeting.record-opening");
      await json(`/council-meetings/${meeting.id}/agenda-freeze`, "POST", {});
      const notice = (await json(`/council-meetings/${meeting.id}/notices`, "POST", {}, 201)).properties;
      expect(notice).toMatchObject({
        version: 1,
        isCurrent: true,
        facts: {
          meeting: {
            agenda: [
              { title: "Budget éclairage" },
              ...[2, 3, 4, 6].map((position) => ({ title: `Numbering question ${position}` })),
            ],
          },
        },
      });
      expect(
        notice.facts.meeting.agenda.map((item: { id: string; agendaNumber: number }) => ({
          id: item.id,
          agendaNumber: item.agendaNumber,
        })),
      ).toEqual(
        presented.map((item: { id: string; agendaNumber: number }) => ({
          id: item.id,
          agendaNumber: item.agendaNumber,
        })),
      );
      const pdfResponse = await fetch(`${server.url}/api/meeting-notices/${notice.id}/content`);
      expect(pdfResponse.status).toBe(200);
      const pdf = Buffer.from(await pdfResponse.arrayBuffer());
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      const pdfLoading = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
      const pdfDocument = await pdfLoading.promise;
      try {
        const content = await (await pdfDocument.getPage(1)).getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ");
        expect(text).toMatch(/5\.\s*Numbering question 6/);
        expect(text).not.toMatch(/6\.\s*Numbering question 6/);
      } finally {
        await pdfLoading.destroy();
      }
      const preparation = (await json(`/council-meetings/${meeting.id}/notice-message`)).properties;
      expect(preparation).toMatchObject({ canGenerate: true, missingEmailMemberIds: [] });
      expect(preparation.recipients).toHaveLength(15);
      const messageResponse = await fetch(`${server.url}/api/council-meetings/${meeting.id}/notice-message`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: server.url },
        body: JSON.stringify({ noticeId: notice.id }),
      });
      expect(messageResponse.status).toBe(200);
      expect(messageResponse.headers.get("content-type")).toContain("message/rfc822");
      const eml = Buffer.from(await messageResponse.arrayBuffer());
      const mime = eml.toString();
      expect(mime).toContain("alice@example.test");
      expect(mime).toContain("benoit@example.test");
      expect(mime).toMatch(/X-Unsent: 1/i);
      expect(mime.replace(/\r?\n/g, "")).toContain(pdf.toString("base64"));
      await writeFile("/tmp/hall-notice-verification.pdf", pdf);
      await writeFile("/tmp/hall-notice-verification.eml", eml);
      await pool.query("UPDATE hall.contact SET email=NULL WHERE email='benoit@example.test'");
      expect((await json(`/council-meetings/${meeting.id}/notice-message`)).properties).toMatchObject({
        canGenerate: false,
      });
      await json(`/council-meetings/${meeting.id}/notice-message`, "POST", { noticeId: notice.id }, 409);
      await pool.query("UPDATE hall.contact SET email='benoit@example.test' WHERE first_name='Benoît'");
      await json(`/council-meetings/${meeting.id}/agenda-reopening`, "POST", {});
      await json(`/council-meetings/${meeting.id}/notice-message`, "POST", { noticeId: notice.id }, 409);
      expect((await json(`/meeting-notices/${notice.id}`)).properties.isCurrent).toBe(false);
      await pool.query(
        "SELECT hall_api.schedule_council_meeting($1,TIMESTAMPTZ '2026-01-01 18:00:00+00','Salle du conseil')",
        [meeting.id],
      );
      await json(`/council-meetings/${meeting.id}/agenda-freeze`, "POST", {});
      await json(`/council-meetings/${meeting.id}/notices`, "POST", {}, 201);
      const memberIds = preparation.recipients.map((r: { councilMemberId: string }) => r.councilMemberId);
      const opening = {
        observedAt: "2026-01-01T18:01:00Z",
        chairMemberId: memberIds[0],
        secretaryMemberId: memberIds[0],
        attendance: memberIds.map((id: string, index: number) => ({
          councilMemberId: id,
          status: index < 7 ? "present" : "absent",
        })),
      };
      const failed = (await json(`/council-meetings/${meeting.id}/record-opening`, "POST", opening)).properties;
      expect(failed.meeting.startedAt).not.toBeNull();
      expect(failed.quorumObservations).toHaveLength(1);
      expect(failed.quorumObservations[0].facts).toMatchObject({
        verdict: "notMet",
        memberCount: 15,
        presentCount: 7,
        requiredPresent: 8,
      });
      expect(failed.canRecordReconvocation).toBe(true);
      const noticeBeforeAddition = (
        await pool.query(
          "SELECT facts FROM hall.meeting_notice WHERE council_meeting=$1 ORDER BY version DESC LIMIT 1",
          [meeting.id],
        )
      ).rows[0].facts;
      const question = (
        await json(
          `/council-meetings/${meeting.id}/open-questions`,
          "POST",
          { path: "seed", name: "Question ajoutée sans quorum", content: "Texte de discussion" },
          201,
        )
      ).properties;
      expect(question).toMatchObject({
        agendaNumber: 6,
        subject: { kind: "openQuestion", content: "Texte de discussion" },
      });
      expect(question.introducedAt).toEqual(expect.any(String));
      expect(
        (
          await pool.query(
            "SELECT facts FROM hall.meeting_notice WHERE council_meeting=$1 ORDER BY version DESC LIMIT 1",
            [meeting.id],
          )
        ).rows[0].facts,
      ).toEqual(noticeBeforeAddition);
      await json(
        `/council-meetings/${meeting.id}/open-questions`,
        "POST",
        { path: "seed", name: "No injected variant", content: "", kind: "councilDecisionProposal" },
        400,
      );

      expect(failed.reconvocations).toEqual([]);
      expect(
        (
          await pool.query("SELECT count(*)::int n FROM hall.meeting_membership_record WHERE council_meeting=$1", [
            meeting.id,
          ])
        ).rows[0].n,
      ).toBe(1);
      expect(
        (await pool.query("SELECT count(*)::int n FROM hall.meeting_attendance WHERE council_meeting=$1", [meeting.id]))
          .rows[0].n,
      ).toBe(15);
      await json(
        `/council-meetings/${meeting.id}/attendance-events`,
        "POST",
        {
          observedAt: "2026-01-01T18:02:00Z",
          changes: [
            {
              councilMemberId: memberIds[7],
              status: "present",
              proxyHolderCouncilMemberId: null,
              proxyDocumentId: null,
            },
          ],
        },
        201,
      );
      const observed = (
        await json(
          `/council-meetings/${meeting.id}/quorum-observations`,
          "POST",
          { agendaItemId: null, observedAt: "2026-01-01T18:03:00Z" },
          201,
        )
      ).properties;
      expect(observed.quorumObservations.map((entry: { facts: { verdict: string } }) => entry.facts.verdict)).toEqual([
        "notMet",
        "met",
      ]);
      const conduct = await json(`/council-meetings/${meeting.id}/conduct`);
      expect(conduct.properties).not.toHaveProperty("canRecordMembership");
      expect(
        (
          await pool.query(
            "SELECT cardinality(member_ids) n,source_reference FROM hall.meeting_membership_record WHERE council_meeting=$1",
            [meeting.id],
          )
        ).rows,
      ).toEqual(
        Array.from({ length: 1 }, () => ({ n: 15, source_reference: expect.stringMatching(/^council-term:/) })),
      );
    } finally {
      await server.close();
      await pool.end();
    }
  }, 60_000);
});
