import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { resetPostgresTestDatabase } from "../src/__tests__/support/postgresTestDatabase.js";
import { startHttpServer } from "../src/server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresTest = databaseUrl ? it : it.skip;
const execute = promisify(execFile);

postgresTest.each(["foncine-le-bas-session", "foncine-le-bas-minutes"])(
  "seed foncine-le-bas %s loads the real territory, the fictional council and its meeting history",
  async (scenario) => {
    const pool = new Pool({ connectionString: databaseUrl });
    await resetPostgresTestDatabase(pool);
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
      devAutoLogin: true,
    });
    try {
      const result = await execute(
        process.execPath,
        [
          fileURLToPath(new URL("../../../scripts/seed/seed-dev.mjs", import.meta.url)),
          "--dataset",
          "foncine-le-bas",
          "--scenario",
          scenario,
        ],
        { env: { ...process.env, SEED_API: `${server.url}/api` }, timeout: 240000, maxBuffer: 4 * 1024 * 1024 },
      );
      expect(result.stdout).toContain(`Jeu : foncine-le-bas ; scénario : ${scenario}`);
      expect(result.stdout).toContain("Seed terminé.");
      const get = async (path: string) => {
        const response = await fetch(`${server.url}/api${path}`);
        expect(response.status).toBe(200);
        const envelope = await response.json();
        if (Array.isArray(envelope.properties?.items)) return envelope.properties.items;
        if (envelope.class?.some((name: string) => name.endsWith("-collection")))
          return (envelope.entities ?? []).map((entry: { properties: unknown }) => entry.properties);
        return envelope.properties;
      };
      expect(await get("/settings")).toMatchObject({
        name: "Foncine-le-Bas",
        inseeCode: "39227",
        population: 203,
        geographicPosition: [6.0294, 46.6324],
      });
      const members = await get("/council-members");
      expect(members).toHaveLength(11);
      expect(members.map((member: { rank: number }) => member.rank).sort((a: number, b: number) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      ]);
      const contacts = await get("/contacts");
      expect(contacts).toHaveLength(28);
      expect(JSON.stringify(contacts)).not.toMatch(/alesia|Vercingétorix/);
      expect(await get("/council-committees")).toHaveLength(3);
      expect(await get("/users")).toHaveLength(5);
      expect(await get("/mail-recipient-groups")).toHaveLength(3);
      expect(await get("/council-business/workspace-items")).toHaveLength(11);
      expect(await get("/council-business/prepared-subjects")).toHaveLength(20);

      const catalog = await get("/resources/catalog");
      const count = (kind: string) => catalog.filter((resource: { kind: string }) => resource.kind === kind).length;
      expect(count("geographic")).toBe(6);
      expect(count("geographicLayer")).toBe(2);
      expect(count("event")).toBe(13);
      expect(count("spreadsheet")).toBe(7);
      expect(catalog.map((resource: { fullPath: string }) => resource.fullPath)).toEqual(
        expect.arrayContaining([
          "Voirie/Réfection du chemin communal du Mont Noir/Devis · Enrobé",
          "Associations et fêtes/Convention d’occupation du Champ de Mars",
          "Espaces personnels/Nicolas Garnier/Visite du chemin du Mont Noir",
          "Voirie/Réfection du chemin communal du Mont Noir/Buse à remplacer",
          "Ornière, côté est",
        ]),
      );
      expect(
        (await pool.query("SELECT count(*)::int count FROM hall.binary_object WHERE media_type LIKE 'image/%'")).rows[0]
          .count,
      ).toBeGreaterThanOrEqual(21);
      const property = await get("/resources/geographic-layers/municipal-property");
      expect(property.parcelIds).toHaveLength(199);
      const report = await get("/resources/rapport");
      expect(report.content).toMatch(/::image\[Ornière, côté est\]/);
      expect(report.content).toMatch(/::resource-embed\[Carte du chemin communal\]/);
      expect(report.content).toMatch(/:resource\[Code de la voirie routière\]\{#[^}]+\}, article L141-8/);

      const meetings = await get("/council-meetings");
      const decisions = await get("/council-decisions");
      expect(decisions.filter((decision: { state: string }) => decision.state === "frozen")).toHaveLength(8);
      expect(
        (await pool.query("SELECT mode, count(*)::int count FROM hall.ballots GROUP BY mode ORDER BY mode")).rows,
      ).toEqual([
        { mode: "public", count: scenario === "foncine-le-bas-minutes" ? 13 : 12 },
        { mode: "secret", count: 2 },
      ]);
      const third = meetings.find((meeting: { number: number }) => meeting.number === 3);
      const conduct = await get(`/council-meetings/${third.id}/conduct`);
      expect(conduct.officerChanges.map((change: { memberName: string }) => change.memberName)).toEqual([
        "Nicolas Garnier",
      ]);
      expect(conduct.auxiliaryAttendances.map((attendance: { name: string }) => attendance.name)).toEqual([
        "Sandrine Colin",
        "Yann Le Goff",
      ]);
      expect(conduct.attendanceEvents).toHaveLength(2);
      const fourth = meetings.find((meeting: { number: number }) => meeting.number === 4);
      const fourthAgenda = await get(`/council-meetings/${fourth.id}/agenda-items`);
      const award = fourthAgenda.find(
        (item: { title: string }) =>
          item.title === "Réfection du chemin communal du Mont Noir : attribution des travaux",
      );
      if (scenario === "foncine-le-bas-session") {
        expect(meetings).toHaveLength(4);
        expect(fourth.closedAt).toBeNull();
        expect(award.startedAt).not.toBeNull();
        expect(award.completedAt ?? null).toBeNull();
        return;
      }
      expect(meetings).toHaveLength(5);
      expect(award.completedAt).not.toBeNull();
      const minutes = await get(`/minutes/${fourth.minutesId}`);
      expect(minutes).toMatchObject({ generatedAt: null, documentId: null });
      const fifth = meetings.find((meeting: { number: number }) => meeting.number === 5);
      expect(fifth.scheduledAt).not.toBeNull();
      expect(await get(`/council-meetings/${fifth.id}/agenda-items`)).toHaveLength(5);
    } finally {
      await server.close();
      await pool.end();
    }
  },
  300000,
);
