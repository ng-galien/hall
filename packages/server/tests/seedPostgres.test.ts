import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { startHttpServer } from "../src/server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresTest = databaseUrl ? it : it.skip;
const execute = promisify(execFile);

postgresTest.each(["preparation", "default", "minutes"])(
  "seed %s keeps durable businesses, shared evidence and meeting histories",
  async (scenario) => {
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query(
      "DROP SCHEMA IF EXISTS hall_api CASCADE; DROP SCHEMA IF EXISTS hall CASCADE; DROP SCHEMA IF EXISTS hall_meta CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public",
    );
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
        [fileURLToPath(new URL("../scripts/seed-dev.mjs", import.meta.url))],
        {
          env: { ...process.env, SEED_API: `${server.url}/api`, SEED_MEETING_SCENARIO: scenario },
          timeout: 120000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      expect(result.stdout).toContain("Seed terminé.");
      const get = async (path: string) => {
        const response = await fetch(server.url + "/api" + path);
        expect(response.status).toBe(200);
        const envelope = await response.json();
        if (Array.isArray(envelope.properties?.items)) return envelope.properties.items;
        if (envelope.class?.some((name: string) => name.endsWith("-collection")))
          return (envelope.entities ?? []).map((entry: { properties: unknown }) => entry.properties);
        return envelope.properties;
      };
      const businesses = await get("/council-business/workspace-items");
      const names = businesses.map((business: { title: string }) => business.title);
      expect(names).toEqual(
        expect.arrayContaining([
          "Affaire de démonstration",
          "Patrimoine communal",
          "Restauration scolaire",
          "Commerce de proximité",
          "Éclairage public",
          "Associations",
          "Vie scolaire",
          "Voirie",
        ]),
      );
      expect(names).not.toContain("Cession de la parcelle AB 127");
      expect(names).not.toContain("Tarifs de la restauration scolaire 2026-2027");
      const subjects = (await get("/council-business/prepared-subjects"));
      expect(subjects).toHaveLength(13);
      const property = businesses.find((business: { title: string }) => business.title === "Patrimoine communal");
      const propertySubjects = subjects.filter(
        (subject: { councilBusinessId: string }) => subject.councilBusinessId === property.id,
      );
      expect(propertySubjects.map((subject: { title: string }) => subject.title).sort()).toEqual([
        "Cession de la parcelle AB 127",
        "Rénovation de la salle des fêtes - étude préalable",
      ]);
      const associations = businesses.find((business: { title: string }) => business.title === "Associations");
      const propertyResources = await get(`/council-business/${property.id}/resources`);
      const associationResources = await get(`/council-business/${associations.id}/resources`);
      const catalog = await get("/resources/catalog");
      const sharedRules = catalog.find(
        (resource: { name: string }) => resource.name === "Règlement de mise à disposition",
      );
      expect(propertyResources.some((entry: { resourceId: string }) => entry.resourceId === sharedRules.id)).toBe(true);
      expect(associationResources.some((entry: { resourceId: string }) => entry.resourceId === sharedRules.id)).toBe(
        true,
      );
      expect(sharedRules.path).toBe("travaux/salle-des-fetes");
      const meetings = await get("/council-meetings");
      if (scenario === "preparation") {
        expect(meetings).toHaveLength(1);
        expect(meetings[0]).toMatchObject({ startedAt: null, closedAt: null });
        expect(await get(`/council-meetings/${meetings[0].id}/agenda-items`)).toEqual([]);
        expect((await pool.query("SELECT count(*)::int count FROM hall.ballots")).rows[0].count).toBe(0);
        return;
      }
      expect(
        (await pool.query("SELECT mode, count(*)::int count FROM hall.ballots GROUP BY mode ORDER BY mode")).rows,
      ).toEqual([
        { mode: "public", count: 6 },
        { mode: "secret", count: 1 },
      ]);
      const decisions = await get("/council-decisions");
      expect(decisions).toHaveLength(5);
      const priceDecision = decisions.find(
        (decision: { title: string }) => decision.title === "Tarifs de la restauration scolaire 2026-2027",
      );
      expect((await get(`/council-decisions/${priceDecision.id}`)).facts.ballot.result).toBe("reject");
      const lighting = decisions.find(
        (decision: { title: string }) => decision.title === "Éclairage public - engagement de la tranche 2",
      );
      const lightingBallot = (await get(`/council-decisions/${lighting.id}`)).facts.ballot;
      expect(lightingBallot.mode).toBe("public");
      expect(lightingBallot.votes.filter((vote: { choice: string }) => vote.choice === "approve")).toHaveLength(9);
      expect(lightingBallot.votes.filter((vote: { choice: string }) => vote.choice === "reject")).toHaveLength(3);
      expect(lightingBallot.votes.filter((vote: { choice: string }) => vote.choice === "abstain")).toHaveLength(1);
      const third = meetings.find((meeting: { number: number }) => meeting.number === 3);
      const thirdAgenda = await get(`/council-meetings/${third.id}/agenda-items`);
      expect(thirdAgenda.map((item: { title: string }) => item.title)).toEqual(
        expect.arrayContaining([
          "Éclairage public - engagement de la tranche 2",
          "Rénovation de la salle des fêtes - étude préalable",
          "Stationnement rue des Tilleuls",
        ]),
      );
      if (scenario === "minutes") {
        expect(meetings.filter((meeting: { closedAt: string | null }) => meeting.closedAt)).toHaveLength(3);
        const minutes = await get(`/minutes/${third.minutesId}`);
        expect(minutes).toMatchObject({ generatedAt: null, documentId: null });
        expect(
          minutes.sections.some((section: { content: string }) => section.content.includes("ses conclusion")),
        ).toBe(true);
      } else {
        expect(meetings.filter((meeting: { closedAt: string | null }) => meeting.closedAt)).toHaveLength(2);
        expect(third.startedAt).not.toBeNull();
        expect(third.closedAt).toBeNull();
        expect(
          thirdAgenda.find(
            (item: { title: string }) => item.title === "Rénovation de la salle des fêtes - étude préalable",
          ).startedAt,
        ).not.toBeNull();
      }
    } finally {
      await server.close();
      await pool.end();
    }
  },
  180000,
);
