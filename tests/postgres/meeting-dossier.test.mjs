import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import {
  createPostgresTestPool,
  resetPostgresTestDatabase,
} from "../../packages/server/src/__tests__/support/postgresTestDatabase.ts";
import { startHttpServer } from "../../packages/server/src/server.ts";
import { createSeedApi } from "../../scripts/seed/data/common/api.mjs";
import { main as seed } from "../../scripts/seed/seed-dev.mjs";

async function pdfText(bytes) {
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await loading.promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const content = await (await pdf.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await loading.destroy();
  return pages.join("\n").replaceAll(/\s+/g, " ");
}

// @verifies-requirement HALL-FR-NOT-120
describe("meeting dossier", () => {
  it("gathers the frozen agenda, then each item's report, text and PDF pieces in meeting order", async () => {
    const { databaseUrl, pool } = createPostgresTestPool();
    await resetPostgresTestDatabase(pool);
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl },
      environment: "test",
      devAutoLogin: true,
    });
    const baseUrl = `${server.url}/api`;
    try {
      await seed(["--dataset", "alesia", "--scenario", "preparation"], { SEED_API: baseUrl });
      const api = createSeedApi(baseUrl);
      const meeting = (await api.get("/council-meetings")).find((entry) => !entry.startedAt && !entry.closedAt);
      const members = (await api.get("/council-members")).filter((member) => member.active);

      const early = await fetch(`${baseUrl}/council-meetings/${meeting.id}/dossier`);
      expect(early.status).toBe(409);
      expect((await early.json()).code).toBe("meeting_dossier_unavailable");

      await api.put(`/council-meetings/${meeting.id}/prepare`, {
        scheduledAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        location: "Maison commune de l’oppidum",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      });
      await api.post(`/council-meetings/${meeting.id}/notices`, {});
      const established = (await api.get(`/council-meetings/${meeting.id}`)).agendaRevision.establishedAt;
      expect(established).toBeTruthy();

      const response = await fetch(`${baseUrl}/council-meetings/${meeting.id}/dossier`);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      const text = await pdfText(await response.arrayBuffer());
      expect(text).toContain("Dossier de séance");
      expect(text).toContain("Ordre du jour");

      const agenda = (await api.get(`/council-meetings/${meeting.id}/agenda-items`))
        .filter((item) => item.position > 0)
        .sort((left, right) => left.position - right.position);
      expect(agenda.length).toBeGreaterThan(1);
      let cursor = text.indexOf("Ordre du jour");
      let checkedPiece = false;
      for (const item of agenda) {
        const heading = `Point ${item.agendaNumber} :`;
        const at = text.indexOf(heading, cursor);
        expect(at, heading).toBeGreaterThan(cursor);
        cursor = at;
        if (!item.councilBusinessId || checkedPiece) continue;
        for (const link of await api.get(`/council-business/${item.councilBusinessId}/resources`)) {
          const resource = await api.get(`/resources/${link.resourceId ?? link.id}`);
          if (resource.kind !== "document" || resource.binary?.mediaType !== "application/pdf") continue;
          const pieceBytes = await (await fetch(`${baseUrl}/resources/${resource.id}/content`)).arrayBuffer();
          const pieceText = (await pdfText(pieceBytes)).trim().slice(0, 40);
          const next = agenda[agenda.indexOf(item) + 1];
          const end = next ? text.indexOf(`Point ${next.agendaNumber} :`, cursor) : text.length;
          const pieceAt = text.indexOf(pieceText, cursor);
          expect(pieceAt, resource.name).toBeGreaterThan(cursor);
          expect(pieceAt, resource.name).toBeLessThan(end);
          checkedPiece = true;
          break;
        }
      }
      expect(checkedPiece, "a PDF piece of an agenda business is found in its item").toBe(true);

      const notice = await api.post(`/council-meetings/${meeting.id}/notices`, {});
      const message = await fetch(`${baseUrl}/council-meetings/${meeting.id}/notice-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noticeId: notice.id }),
      });
      expect(message.status, await message.clone().text()).toBe(201);
      const mail = (await message.json()).properties;
      expect(mail.submissions).toEqual([]);
      expect(mail.attachments.map((file) => file.fileName)).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`convocation-${meeting.number}`),
          `dossier-seance-${meeting.number}.pdf`,
        ]),
      );
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
