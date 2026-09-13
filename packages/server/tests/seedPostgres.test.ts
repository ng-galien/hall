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
        [
          fileURLToPath(new URL("../scripts/seed-dev.mjs", import.meta.url)),
          ...(scenario === "preparation" ? [] : ["--dataset", "alesia", "--scenario", scenario]),
        ],
        {
          env: {
            ...process.env,
            SEED_API: `${server.url}/api`,
            SEED_DATASET: scenario === "preparation" ? "alesia" : "invalid-env-dataset",
            SEED_MEETING_SCENARIO: scenario === "preparation" ? scenario : "invalid-env-scenario",
          },
          timeout: 120000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      expect(result.stdout).toContain(`Jeu : alesia ; scénario : ${scenario}`);
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
      const businesses = await get("/council-business/workspace-items");
      expect(await get("/settings")).toMatchObject({
        name: "Alésia",
        geographicPosition: [4.438, 47.558],
        email: "contact@alesia.example",
      });
      const contacts = await get("/contacts");
      expect(contacts).toHaveLength(17);
      expect(contacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ firstName: "Merlin", lastName: "l’Enchanteur" }),
        expect.objectContaining({ firstName: "Jules", lastName: "César" }),
        expect.objectContaining({ firstName: "Vercingétorix", lastName: "l’Arverne" }),
      ]));
      expect(JSON.stringify(contacts)).not.toMatch(/Delcourt|Lefèvre|Préfecture|Perrin/);
      expect(businesses).toHaveLength(8);
      const names = businesses.map((business: { title: string }) => business.title);
      expect(names).toEqual(
        expect.arrayContaining([
          "Veille autour de l’oppidum",
          "Réserves et bâtiments",
          "Ravitaillement",
          "Relations avec les alliés",
          "Défense du plateau",
          "Équipes de soutien",
          "Accueil des habitants",
          "Accès et convois",
        ]),
      );
      expect(names).not.toContain("Affectation du grenier de Cornu aux réserves");
      expect(names).not.toContain("Répartition des réserves de céréales");
      const subjects = await get("/council-business/prepared-subjects");
      expect(subjects).toHaveLength(13);
      const property = businesses.find((business: { title: string }) => business.title === "Réserves et bâtiments");
      const propertySubjects = subjects.filter(
        (subject: { councilBusinessId: string }) => subject.councilBusinessId === property.id,
      );
      expect(propertySubjects.map((subject: { title: string }) => subject.title).sort()).toEqual([
        "Affectation du grenier de Cornu aux réserves",
        "Aménagement des abris de Cornu - étude préalable",
      ]);
      const associations = businesses.find((business: { title: string }) => business.title === "Équipes de soutien");
      const propertyResources = await get(`/council-business/${property.id}/resources`);
      const associationResources = await get(`/council-business/${associations.id}/resources`);
      // @verifies-requirement HALL-FR-WSP-250
      const catalog = await get("/resources/catalog");
      expect(
        catalog.every(
          (resource: { path: string; kind: string; name: string }) =>
            resource.path !== "seed" &&
            !resource.path.startsWith("seed/") &&
            !(resource.kind === "folder" && ["seed", "dossier-vide"].includes(resource.name) && resource.path === ""),
        ),
      ).toBe(true);
      expect(catalog.map((resource: { kind: string }) => resource.kind)).toEqual(
        expect.arrayContaining(["text", "document", "spreadsheet", "geographic", "remote", "event", "folder"]),
      );
      const sharedRules = catalog.find(
        (resource: { name: string }) => resource.name === "Règlement de mise à disposition",
      );
      expect(propertyResources.some((entry: { resourceId: string }) => entry.resourceId === sharedRules.id)).toBe(true);
      expect(associationResources.some((entry: { resourceId: string }) => entry.resourceId === sharedRules.id)).toBe(
        true,
      );
      expect(sharedRules.path).toBe("reserves/abris");
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
        (decision: { title: string }) => decision.title === "Répartition des réserves de céréales",
      );
      expect((await get(`/council-decisions/${priceDecision.id}`)).facts.ballot.result).toBe("reject");
      const lighting = decisions.find(
        (decision: { title: string }) => decision.title === "Défense du plateau - renforcement de la seconde ligne",
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
          "Défense du plateau - renforcement de la seconde ligne",
          "Aménagement des abris de Cornu - étude préalable",
          "Acheminement des vivres entre le grenier et les abris",
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
            (item: { title: string }) => item.title === "Aménagement des abris de Cornu - étude préalable",
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
