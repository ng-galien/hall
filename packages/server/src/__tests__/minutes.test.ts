import type { MinutesDetail, MinutesSummary } from "@hall/api-contract";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createDocumentRenderer } from "../services/documentRenderer.js";
import { createTestServer, domainBody } from "./testServer.js";

describe("dedicated minutes HTTP lifecycle", () => {
  it("creates a draft at closure, edits only narrative and freezes a real PDF outside workspace", async () => {
    const renderer = createDocumentRenderer();
    const renderedHtml: string[] = [];
    const { agent } = await createTestServer({
      documentRenderer: {
        ...renderer,
        async pdf(input) {
          renderedHtml.push(input.html);
          return renderer.pdf(input);
        },
      },
    });
    const templateInput = {
      kind: "pdf",
      documentType: "minutes",
      name: "PV de test",
      bodyMarkdown:
        "# Mon procès-verbal\n\n::minutes{section=facts}\n\n::minutes{section=proceedings}",
      stylesheet: "h1 { color: #123456; font-size: 32px; }",
    };
    const template = domainBody<{ id: string }>(await agent.post("/api/templates").send(templateInput).expect(201));
    const meeting = domainBody<{ id: string }>(
      await agent.post("/api/council-meetings").send({ quorum: 1 }).expect(201),
    );
    const created = domainBody<{ agendaItem: { id: string } }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/council-business`)
        .send({
          kind: "openQuestion",
          path: "seed",
          name: "Discussion",
          reportName: "Rapport",
          reportContent: "",
          position: 1,
        })
        .expect(201),
    );
    await agent
      .put(`/api/council-meetings/${meeting.id}/schedule`)
      .send({ scheduledAt: "2026-09-05T18:00:00Z", location: "Salle du conseil" })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/start`)
      .send({ startedAt: "2026-09-05T18:05:00Z" })
      .expect(200);
    const closed = domainBody<{ minutes: MinutesSummary }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/close`)
        .send({ closedAt: "2026-09-05T20:00:00Z" })
        .expect(200),
    );
    const path = `/api/minutes/${closed.minutes.id}`;
    const opened = await agent.get(path).expect(200);
    const draft = domainBody<MinutesDetail>(opened);
    expect(opened.body.class).toEqual(["minutes"]);
    expect(opened.body.actions.map((entry: { name: string }) => entry.name)).toEqual([
      "minutes.update-draft",
      "minutes.generate",
    ]);
    expect(domainBody(await agent.get("/api/minutes").expect(200))).toEqual([closed.minutes]);
    expect(domainBody(await agent.get("/api/council-business").expect(200))).toHaveLength(1);
    await agent.get(`${path}/content`).expect(409);
    await agent
      .patch(`${path}/draft`)
      .send({ expectedVersion: draft.version, agendaItemId: created.agendaItem.id, content: "Corrected", facts: {} })
      .expect(400);
    const edited = domainBody<MinutesDetail>(
      await agent
        .patch(`${path}/draft`)
        .send({
          expectedVersion: draft.version,
          agendaItemId: created.agendaItem.id,
          content: "Une correction orthographique.",
        })
        .expect(200),
    );
    expect(edited.facts).toEqual(draft.facts);
    expect(edited.sections).toEqual([
      { agendaItemId: created.agendaItem.id, content: "Une correction orthographique." },
    ]);
    for (const bodyMarkdown of [
      "::minutes{section=proceedings}",
      `${templateInput.bodyMarkdown}\n\n::minutes{section=facts}`,
      `${templateInput.bodyMarkdown}\n\n::minutes{section=unknown}`,
    ]) {
      await agent
        .put(`/api/templates/${template.id}`)
        .send({ ...templateInput, bodyMarkdown })
        .expect(200);
      await agent.get(`${path}/preview`).expect(422);
      await agent.post(`${path}/generate`).send({ expectedVersion: edited.version }).expect(422);
      expect(domainBody(await agent.get(path).expect(200))).toEqual(edited);
    }
    await agent.put(`/api/templates/${template.id}`).send(templateInput).expect(200);
    const preview = await agent
      .get(`${path}/preview`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    expect((await PDFDocument.load(preview.body)).getPageCount()).toBeGreaterThan(0);
    expect(renderedHtml.at(-1)).toContain("Mon procès-verbal");
    expect(renderedHtml.at(-1)).toContain("#123456");
    expect(renderedHtml.at(-1)).toContain("Une correction orthographique.");
    expect(domainBody(await agent.get(path).expect(200))).toEqual(edited);
    await agent.get(`${path}/content`).expect(409);
    await agent.post(`${path}/generate`).send({ expectedVersion: draft.version }).expect(409);
    const generatedResponse = await agent
      .post(`${path}/generate`)
      .send({ expectedVersion: edited.version })
      .expect(200);
    const generated = domainBody<MinutesDetail>(generatedResponse);
    expect(generated.generatedAt).not.toBeNull();
    expect(generated.documentId).not.toBeNull();
    expect(generatedResponse.body.actions ?? []).toEqual([]);
    expect(generatedResponse.body.links).toContainEqual({
      rel: ["content"],
      href: `${path}/content`,
      type: "application/pdf",
    });
    const pdf = await agent
      .get(`${path}/content`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    expect((await PDFDocument.load(pdf.body)).getPageCount()).toBeGreaterThan(0);
    await agent
      .put(`/api/templates/${template.id}`)
      .send({
        ...templateInput,
        bodyMarkdown: templateInput.bodyMarkdown.replace("Mon procès-verbal", "Nouveau titre"),
      })
      .expect(200);
    const preserved = await agent.get(`${path}/content`).expect(200);
    expect(preserved.body).toEqual(pdf.body);
    const frozenPreview = await agent.get(`${path}/preview`).expect(200);
    expect(frozenPreview.body).toEqual(pdf.body);
    await agent
      .patch(`${path}/draft`)
      .send({ expectedVersion: generated.version, agendaItemId: created.agendaItem.id, content: "Changed" })
      .expect(409);
    await agent.post(`${path}/generate`).send({ expectedVersion: generated.version }).expect(409);
  });

  it("keeps recorded discussion in the closure draft and rejects later notes", async () => {
    const { agent } = await createTestServer();
    const meeting = domainBody<{ id: string }>(
      await agent.post("/api/council-meetings").send({ quorum: 1 }).expect(201),
    );
    const created = domainBody<{ agendaItem: { id: string } }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/council-business`)
        .send({
          kind: "openQuestion",
          path: "seed",
          name: "Discussion",
          reportName: "Rapport",
          reportContent: "",
          position: 1,
        })
        .expect(201),
    );
    await agent
      .put(`/api/council-meetings/${meeting.id}/schedule`)
      .send({ scheduledAt: "2026-09-05T18:00:00Z", location: "Salle" })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/start`)
      .send({ startedAt: "2026-09-05T18:05:00Z" })
      .expect(200);
    const notesPath = `/api/council-meetings/${meeting.id}/agenda-items/${created.agendaItem.id}/notes`;
    await agent.patch(notesPath).send({ discussionSummary: "La commission présente ses conclusions." }).expect(200);
    const closed = domainBody<{ minutes: MinutesSummary }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/close`)
        .send({ closedAt: "2026-09-05T20:00:00Z" })
        .expect(200),
    );
    const minutes = domainBody<MinutesDetail>(await agent.get(`/api/minutes/${closed.minutes.id}`).expect(200));
    expect(minutes.sections).toEqual([
      { agendaItemId: created.agendaItem.id, content: "La commission présente ses conclusions." },
    ]);
    await agent.patch(notesPath).send({ discussionSummary: "Late change" }).expect(409);
  });
});
