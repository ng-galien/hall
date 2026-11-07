import { jinjaBody } from "@hall/domain";
import { PostgresDirectory } from "@hall/postgres";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createDocumentRenderer } from "../services/documentRenderer.js";
import { createTestServer, domainBody } from "./testServer.js";

describe("attendance sheet and proxy form of a meeting", () => {
  // @verifies-requirement HALL-FR-ATT-170
  // @verifies-requirement HALL-FR-ATT-180
  it("produces the blank attendance sheet and a proxy form between two distinct members in mandate", async () => {
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
    const pool = container.cradle.postgresPool;
    if (!pool) throw new Error("A PostgreSQL pool is required for the meeting scenario");
    const databaseRequest = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "attendance-documents", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await pool.query("UPDATE public.hall_settings SET name='Commune témoin',time_zone='Europe/Paris' WHERE id='hall'");
    await new PostgresDirectory(pool).configureActiveCouncilTerm(databaseRequest, 3);
    const member = async (firstName: string, role: string) => {
      const contact = domainBody<{ id: string }>(
        await agent.post("/api/contacts").send({ firstName, lastName: "Test" }).expect(201),
      );
      return domainBody<{ id: string }>(
        await agent
          .post("/api/council-members")
          .send({ contactId: contact.id, role, termStartedOn: "2026-03-22" })
          .expect(201),
      );
    };
    const councillor = await member("Claire", "councillor");
    const mayor = await member("Martine", "mayor");
    for (const documentType of ["attendance-sheet", "proxy-form"])
      await agent
        .post("/api/templates")
        .send({ kind: "pdf", documentType, name: documentType, bodyMarkdown: jinjaBody(documentType) })
        .expect(201);
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));

    const links = (await agent.get(`/api/council-meetings/${meeting.id}`).expect(200)).body.links.map(
      (link: { rel: string[] }) => link.rel[0],
    );
    expect(links).toEqual(expect.arrayContaining(["attendance-sheet", "proxy-form"]));

    const sheet = await agent
      .get(`/api/council-meetings/${meeting.id}/attendance-sheet.pdf`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    expect((await PDFDocument.load(sheet.body)).getPageCount()).toBeGreaterThan(0);
    const sheetHtml = renderedHtml.at(-1)!;
    expect(sheetHtml).toContain("Feuille d’émargement");
    expect(sheetHtml.indexOf("<td>Martine Test</td><td>Maire</td><td></td>")).toBeGreaterThan(0);
    expect(sheetHtml.indexOf("<td>Martine Test</td>")).toBeLessThan(sheetHtml.indexOf("<td>Claire Test</td>"));
    expect(sheetHtml).not.toContain("Présents :");

    await agent
      .get(`/api/council-meetings/${meeting.id}/proxy-form.pdf`)
      .query({ grantorMemberId: councillor.id, holderMemberId: mayor.id })
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    const proxyHtml = renderedHtml.at(-1)!;
    expect(proxyHtml).toContain("Je soussigné(e) <strong>Claire Test</strong>, membre du conseil municipal");
    expect(proxyHtml).toContain("donne pouvoir à <strong>Martine Test</strong>, maire");

    const refused = await agent
      .get(`/api/council-meetings/${meeting.id}/proxy-form.pdf`)
      .query({ grantorMemberId: councillor.id, holderMemberId: councillor.id })
      .expect(422);
    expect(refused.body.code).toBe("proxy_form_invalid");
  });
});
