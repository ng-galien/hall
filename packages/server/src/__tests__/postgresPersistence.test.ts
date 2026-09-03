import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildContainer } from "../core/container.js";
import { startHttpServer } from "../server.js";
import { defineBallotPersistenceContract } from "./support/ballotPersistenceContract.js";
import { prepareBallotScenario } from "./support/ballotScenario.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6uAAAAABJRU5ErkJggg==",
  "base64",
);

async function resetPostgres(): Promise<void> {
  const setup = new Pool({ connectionString: databaseUrl });
  await setup.query(
    "DROP SCHEMA IF EXISTS hall_api CASCADE; DROP SCHEMA IF EXISTS hall CASCADE; DROP SCHEMA IF EXISTS hall_meta CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public",
  );
  await setup.end();
}

async function databaseUrlForHallRole(): Promise<string> {
  const setup = new Pool({ connectionString: databaseUrl });
  await setup.query(`
    DO $body$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hall') THEN
        CREATE ROLE hall LOGIN SUPERUSER PASSWORD 'hall-test-owner';
      ELSE
        ALTER ROLE hall WITH LOGIN SUPERUSER PASSWORD 'hall-test-owner';
      END IF;
    END
    $body$
  `);
  await setup.end();
  const url = new URL(databaseUrl!);
  url.username = "hall";
  url.password = "hall-test-owner";
  return url.toString();
}

async function waitForTransactionLock(pool: Pool, processId: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const activity = await pool.query<{ wait_event_type: string | null }>(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
      [processId],
    );
    if (activity.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`PostgreSQL backend ${processId} never waited on the expected transaction lock`);
}

async function createEmptyPublicBallot() {
  await resetPostgres();
  const scenario = await prepareBallotScenario({ kind: "postgres", url: databaseUrl! });
  const ballotId = randomUUID();
  const memberIds = scenario.members.map((member) => member.id);
  await scenario.container.cradle.sqlExecutor.run("ballot.insert", {
    id: ballotId,
    meetingId: scenario.meeting.id,
    councilDecisionId: null,
    agendaItemId: scenario.agendaItem.id,
    idempotencyKey: randomUUID(),
    commandFingerprint: randomUUID(),
    method: "public",
    result: "adopted",
    votesFor: 1,
    votesAgainst: 0,
    abstentions: 0,
    notVoting: 0,
    chairTieBreakApplied: false,
    recusedMemberIdsJson: "[]",
    participationEvidenceJson: JSON.stringify({
      rosterMemberIds: memberIds,
      attendance: memberIds.map((memberId) => ({
        memberId,
        status: "present",
        proxyHolderMemberId: null,
        proxyDocumentId: null,
        version: 1,
      })),
      quorum: { activeMembers: memberIds.length, physicallyPresent: memberIds.length, required: 2, reached: true },
    }),
    createdAt: new Date().toISOString(),
  });
  return { scenario, ballotId };
}

postgres("PostgreSQL persistence", () => {
  defineBallotPersistenceContract("shared ballot persistence contract", async () => {
    const setup = new Pool({ connectionString: databaseUrl });
    await setup.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await setup.end();
    return { kind: "postgres", url: databaseUrl! };
  });

  it("retains past council terms while enforcing a single active term", async () => {
    await resetPostgres();
    const container = buildContainer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
    });
    await container.cradle.sqlExecutor.ready();
    const pool = new Pool({ connectionString: databaseUrl! });
    try {
      await pool.query(
        "INSERT INTO council_terms (id, hall_id, expected_member_count, active) VALUES ($1, 'hall', $2, FALSE)",
        ["previous", 11],
      );
      await expect(pool.query("SELECT COUNT(*)::integer AS count FROM council_terms")).resolves.toMatchObject({
        rows: [{ count: 2 }],
      });
      await expect(
        pool.query(
          "INSERT INTO council_terms (id, hall_id, expected_member_count, active) VALUES ($1, 'hall', $2, TRUE)",
          ["competing", 15],
        ),
      ).rejects.toMatchObject({ code: "23505", constraint: "one_active_council_term_per_hall" });
    } finally {
      await pool.end();
      await container.cradle.sqlExecutor.close();
    }
  });

  it("serializes concurrent member creation against the active council term capacity", async () => {
    await resetPostgres();
    const container = buildContainer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
    });
    await container.cradle.sqlExecutor.ready();
    try {
      await container.cradle.councilTermRepository.updateActiveExpectedMemberCount(1);
      const contacts = await Promise.all(
        ["Inès", "Lina", "Marc"].map((firstName) =>
          container.cradle.contactRepository.create({
            firstName,
            lastName: "Petit",
            organizationName: null,
            jobTitle: null,
            email: null,
            phone: null,
            notes: "",
          }),
        ),
      );
      const oldMember = await container.cradle.councilMemberRepository.create({
        contactId: contacts[0].id,
        role: "councillor",
        termStartedOn: "2020-03-15",
      });
      await container.cradle.councilMemberRepository.update(oldMember.id, {
        role: "councillor",
        termStartedOn: "2020-03-15",
        termEndedOn: "2026-03-21",
      });
      const creations = await Promise.allSettled(
        contacts.slice(1).map((contact, index) =>
          container.cradle.councilMemberRepository.create({
            contactId: contact.id,
            role: index === 0 ? "mayor" : "councillor",
            termStartedOn: "2026-03-22",
          }),
        ),
      );

      expect(creations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(creations.filter((result) => result.status === "rejected")).toEqual([
        expect.objectContaining({ reason: expect.objectContaining({ constraint: "council_term_capacity_reached" }) }),
      ]);
      await expect(
        container.cradle.councilMemberRepository.update(oldMember.id, {
          role: "councillor",
          termStartedOn: "2020-03-15",
          termEndedOn: null,
        }),
      ).rejects.toMatchObject({ constraint: "council_term_capacity_reached" });
    } finally {
      await container.cradle.sqlExecutor.close();
    }
  });

  it("blocks a public-to-secret update behind an uncommitted vote and rejects it after commit", async () => {
    const { scenario, ballotId } = await createEmptyPublicBallot();
    const pool = new Pool({ connectionString: databaseUrl });
    const voteWriter = await pool.connect();
    const methodWriter = await pool.connect();
    const methodWriterProcessId = (await methodWriter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
      ?.pid;
    if (!methodWriterProcessId) throw new Error("Expected the PostgreSQL method-writer process id");
    try {
      await voteWriter.query("BEGIN");
      await voteWriter.query(
        `INSERT INTO votes (id, ballot_id, member_id, cast_by_member_id, choice, position)
         VALUES ($1, $2, $3, $3, 'for', 1)`,
        [randomUUID(), ballotId, scenario.members[0]?.id],
      );
      await methodWriter.query("BEGIN");
      const methodUpdate = methodWriter.query("UPDATE ballots SET method = 'secret' WHERE id = $1", [ballotId]);
      await waitForTransactionLock(pool, methodWriterProcessId);
      await voteWriter.query("COMMIT");
      await expect(methodUpdate).rejects.toMatchObject({ code: "23514" });
      await methodWriter.query("ROLLBACK");

      const invariant = await pool.query<{ method: string; vote_count: string }>(
        `SELECT ballots.method, COUNT(votes.id)::text AS vote_count
         FROM ballots LEFT JOIN votes ON votes.ballot_id = ballots.id
         WHERE ballots.id = $1 GROUP BY ballots.id`,
        [ballotId],
      );
      expect(invariant.rows).toEqual([{ method: "public", vote_count: "1" }]);
    } finally {
      await voteWriter.query("ROLLBACK").catch(() => undefined);
      await methodWriter.query("ROLLBACK").catch(() => undefined);
      voteWriter.release();
      methodWriter.release();
      await pool.end();
      await scenario.container.cradle.sqlExecutor.close();
    }
  });

  it("blocks a vote behind an uncommitted secret method and rejects it after commit", async () => {
    const { scenario, ballotId } = await createEmptyPublicBallot();
    const pool = new Pool({ connectionString: databaseUrl });
    const methodWriter = await pool.connect();
    const voteWriter = await pool.connect();
    const voteWriterProcessId = (await voteWriter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
      ?.pid;
    if (!voteWriterProcessId) throw new Error("Expected the PostgreSQL vote-writer process id");
    try {
      await methodWriter.query("BEGIN");
      await methodWriter.query("UPDATE ballots SET method = 'secret' WHERE id = $1", [ballotId]);
      await voteWriter.query("BEGIN");
      const voteInsert = voteWriter.query(
        `INSERT INTO votes (id, ballot_id, member_id, cast_by_member_id, choice, position)
         VALUES ($1, $2, $3, $3, 'for', 1)`,
        [randomUUID(), ballotId, scenario.members[0]?.id],
      );
      await waitForTransactionLock(pool, voteWriterProcessId);
      await methodWriter.query("COMMIT");
      await expect(voteInsert).rejects.toMatchObject({ code: "23514" });
      await voteWriter.query("ROLLBACK");

      const invariant = await pool.query<{ method: string; vote_count: string }>(
        `SELECT ballots.method, COUNT(votes.id)::text AS vote_count
         FROM ballots LEFT JOIN votes ON votes.ballot_id = ballots.id
         WHERE ballots.id = $1 GROUP BY ballots.id`,
        [ballotId],
      );
      expect(invariant.rows).toEqual([{ method: "secret", vote_count: "0" }]);
    } finally {
      await methodWriter.query("ROLLBACK").catch(() => undefined);
      await voteWriter.query("ROLLBACK").catch(() => undefined);
      methodWriter.release();
      voteWriter.release();
      await pool.end();
      await scenario.container.cradle.sqlExecutor.close();
    }
  });

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
    await resetPostgres();

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

  it("starts when the database role has the same name as the Hall schema", async () => {
    await resetPostgres();
    const ownerUrl = await databaseUrlForHallRole();
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: ownerUrl },
      environment: "test",
    });
    try {
      const response = await fetch(`${server.url}/api/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });

      const inspection = new Pool({ connectionString: ownerUrl });
      const schemas = await inspection.query<{ documentary: boolean; legacy: boolean }>(
        `SELECT to_regclass('hall.resource') IS NOT NULL AS documentary,
                to_regclass('public.contacts') IS NOT NULL AS legacy`,
      );
      await inspection.end();
      expect(schemas.rows).toEqual([{ documentary: true, legacy: true }]);
    } finally {
      await server.close();
    }
  });

  it("serves the modern documentary contract through PostgreSQL", async () => {
    await resetPostgres();
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
      devAutoLogin: true,
    });
    const mutationHeaders = { "content-type": "application/json", origin: server.url };
    try {
      const createdResponse = await fetch(`${server.url}/api/resources`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          kind: "text",
          path: "school/menus",
          name: "Menu septembre.md",
          content: "Initial",
        }),
      });
      expect(createdResponse.status).toBe(201);
      const createdRepresentation = (await createdResponse.json()) as {
        properties: Record<string, unknown>;
        actions: Array<{ name: string; href: string }>;
      };
      expect(createdRepresentation.properties).toMatchObject({
        kind: "text",
        slug: "menu-septembre-md",
        fullPath: "school/menus/Menu septembre.md",
        tags: [],
        autosaveEnabled: true,
        content: "Initial",
        version: 1,
      });
      expect(createdRepresentation.properties).not.toHaveProperty("councilBusiness");
      expect(createdRepresentation.actions.map(({ name }) => name)).toEqual([
        "resource.relocate",
        "resource.update-metadata",
        "resource.update-content",
        "resource.delete",
      ]);

      const listResponse = await fetch(`${server.url}/api/resources?path=school%2Fmenus`);
      expect(listResponse.status).toBe(200);
      const listRepresentation = (await listResponse.json()) as {
        properties: Record<string, unknown>;
        entities: Array<{ properties: Record<string, unknown> }>;
        links: Array<{ rel: string[]; href: string }>;
      };
      expect(listRepresentation.properties).not.toHaveProperty("count");
      expect(listRepresentation.links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rel: ["catalog"], href: "/api/resources/catalog" }),
          expect.objectContaining({ rel: ["search"], href: "/api/resources/search" }),
        ]),
      );
      const collectionActions = (listRepresentation as unknown as { actions: Array<{ name: string }> }).actions;
      expect(collectionActions.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "resource.create",
          "resource.create-document",
          "resource.import-spreadsheet",
          "resource.create-editor-asset",
          "resource.search-legal-references",
        ]),
      );
      expect(listRepresentation.entities.map(({ properties }) => properties)).toEqual([
        expect.objectContaining({ slug: "menu-septembre-md", name: "Menu septembre.md", kind: "text" }),
      ]);
      expect(listRepresentation.entities[0]?.properties).not.toHaveProperty("content");

      const catalogResponse = await fetch(`${server.url}/api/resources/catalog`);
      expect(catalogResponse.status).toBe(200);
      const catalogRepresentation = (await catalogResponse.json()) as {
        properties: Record<string, unknown>;
        entities: Array<{ properties: Record<string, unknown> }>;
      };
      expect(catalogRepresentation.properties).not.toHaveProperty("count");
      expect(catalogRepresentation.entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({ kind: "text", fullPath: "school/menus/Menu septembre.md" }),
          }),
        ]),
      );
      expect(catalogRepresentation.entities[0]?.properties).not.toHaveProperty("tags");

      const searchResponse = await fetch(`${server.url}/api/resources/search?query=septembre`);
      expect(searchResponse.status).toBe(200);
      const searchRepresentation = (await searchResponse.json()) as {
        properties: { items: Array<Record<string, unknown>>; facets: Record<string, unknown[]> };
      };
      expect(searchRepresentation.properties.items).toEqual([
        expect.objectContaining({ kind: "text", fullPath: "school/menus/Menu septembre.md" }),
      ]);
      expect(searchRepresentation.properties.facets).toMatchObject({
        paths: expect.any(Array),
        tags: expect.any(Array),
        readiness: expect.any(Array),
        media: expect.any(Array),
      });
      expect(searchRepresentation.properties).not.toHaveProperty("count");

      const openedResponse = await fetch(`${server.url}/api/resources/menu-septembre-md`);
      expect(openedResponse.status).toBe(200);
      const openedRepresentation = (await openedResponse.json()) as { properties: Record<string, unknown> };
      expect(openedRepresentation.properties).toMatchObject({ content: "Initial", version: 1 });

      const updateResponse = await fetch(`${server.url}/api/resources/menu-septembre-md/content`, {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify({ kind: "text", expectedVersion: 1, content: "Updated" }),
      });
      expect(updateResponse.status).toBe(200);
      const updatedRepresentation = (await updateResponse.json()) as { properties: Record<string, unknown> };
      expect(updatedRepresentation.properties).toMatchObject({ content: "Updated", version: 2 });

      const metadataResponse = await fetch(`${server.url}/api/resources/menu-septembre-md/metadata`, {
        method: "PATCH",
        headers: mutationHeaders,
        body: JSON.stringify({
          path: "school/menus",
          name: "Menu septembre.md",
          tags: ["cantine", "septembre"],
          editing: { kind: "autosave", enabled: false },
        }),
      });
      expect(metadataResponse.status).toBe(200);
      const metadataRepresentation = (await metadataResponse.json()) as { properties: Record<string, unknown> };
      expect(metadataRepresentation.properties).toMatchObject({
        tags: ["cantine", "septembre"],
        autosaveEnabled: false,
      });

      const relocateResponse = await fetch(`${server.url}/api/resources/menu-septembre-md/location`, {
        method: "PATCH",
        headers: mutationHeaders,
        body: JSON.stringify({ path: "school", name: "Menu.md" }),
      });
      expect(relocateResponse.status).toBe(200);
      const relocatedRepresentation = (await relocateResponse.json()) as { properties: Record<string, unknown> };
      expect(relocatedRepresentation.properties).toMatchObject({
        slug: "menu-septembre-md",
        fullPath: "school/Menu.md",
      });

      const upload = new FormData();
      upload.set("path", "school");
      upload.set("name", "Proof.txt");
      upload.set("file", new Blob(["proof"], { type: "text/plain" }), "Proof.txt");
      const documentResponse = await fetch(`${server.url}/api/resources/documents`, {
        method: "POST",
        headers: { origin: server.url },
        body: upload,
      });
      expect(documentResponse.status).toBe(201);
      const documentRepresentation = (await documentResponse.json()) as {
        properties: { slug: string; binary: { byteSize: number } };
      };
      expect(documentRepresentation.properties).toMatchObject({
        slug: "proof-txt",
        binary: { byteSize: 5 },
      });

      const contentResponse = await fetch(
        `${server.url}/api/resources/${documentRepresentation.properties.slug}/content`,
      );
      expect(contentResponse.status).toBe(200);
      expect(contentResponse.headers.get("content-type")).toContain("text/plain");
      expect(await contentResponse.text()).toBe("proof");

      const assetUpload = new FormData();
      assetUpload.set("ownerKind", "textResourceContent");
      assetUpload.set("ownerId", String(createdRepresentation.properties.id));
      assetUpload.set("title", "Plan de la salle");
      assetUpload.set("file", new Blob([png], { type: "image/png" }), "plan.png");
      const assetResponse = await fetch(`${server.url}/api/resources/editor-assets`, {
        method: "POST",
        headers: { origin: server.url },
        body: assetUpload,
      });
      expect(assetResponse.status).toBe(201);
      const assetRepresentation = (await assetResponse.json()) as {
        properties: { id: string; owner: { kind: string; id: string } };
      };
      expect(assetRepresentation.properties.owner).toEqual({
        kind: "textResourceContent",
        id: createdRepresentation.properties.id,
      });

      const assetReference = `::image[Plan]{#${assetRepresentation.properties.id} align="center" width="75"}`;
      const referenceResponse = await fetch(`${server.url}/api/resources/menu-septembre-md/content`, {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify({ kind: "text", expectedVersion: 2, content: assetReference }),
      });
      expect(referenceResponse.status).toBe(200);
      const unifiedContent = await fetch(
        `${server.url}/api/resources/binary-references/${assetRepresentation.properties.id}/content`,
      );
      expect(unifiedContent.status).toBe(200);
      expect(Buffer.from(await unifiedContent.arrayBuffer())).toEqual(png);

      const purgeResponse = await fetch(`${server.url}/api/resources/menu-septembre-md/content`, {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify({ kind: "text", expectedVersion: 3, content: "Image removed" }),
      });
      expect(purgeResponse.status).toBe(200);
      expect(
        (await fetch(`${server.url}/api/resources/editor-assets/${assetRepresentation.properties.id}`)).status,
      ).toBe(404);

      const spreadsheetImport = new FormData();
      spreadsheetImport.set("path", "school");
      spreadsheetImport.set("name", "Budget");
      spreadsheetImport.set("file", new Blob(["Label;Montant\nCantine;12,50"], { type: "text/csv" }), "budget.csv");
      const spreadsheetResponse = await fetch(`${server.url}/api/resources/spreadsheets/import`, {
        method: "POST",
        headers: { origin: server.url },
        body: spreadsheetImport,
      });
      expect(spreadsheetResponse.status).toBe(201);
      const spreadsheetRepresentation = (await spreadsheetResponse.json()) as { properties: Record<string, unknown> };
      expect(spreadsheetRepresentation.properties).toMatchObject({ kind: "spreadsheet", name: "Budget", version: 1 });

      const legalResponse = await fetch(`${server.url}/api/resources`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          kind: "legalReference",
          path: "school",
          name: "Article à résoudre",
        }),
      });
      expect(legalResponse.status).toBe(201);
      const legalRepresentation = (await legalResponse.json()) as { actions: Array<{ name: string }> };
      expect(legalRepresentation.actions.map(({ name }) => name)).toContain("resource.resolve-legal-reference");

      const inspection = new Pool({ connectionString: databaseUrl! });
      const folder = await inspection.query<{ id: string }>(
        "SELECT id::text FROM hall.resource WHERE full_path = 'school'",
      );
      const folderRelocation = await fetch(`${server.url}/api/resources/${folder.rows[0]?.id}/location`, {
        method: "PATCH",
        headers: mutationHeaders,
        body: JSON.stringify({ path: "", name: "education" }),
      });
      expect(folderRelocation.status).toBe(200);
      const relocatedResource = await fetch(`${server.url}/api/resources/menu-septembre-md`);
      expect(relocatedResource.status).toBe(200);
      await expect(relocatedResource.json()).resolves.toMatchObject({
        properties: { id: createdRepresentation.properties.id, fullPath: "education/Menu.md" },
      });
      await inspection.end();
    } finally {
      await server.close();
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
      contactRepository,
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
        geographicPosition: [2.3522, 48.8566] as [number, number],
        phone: "+33 1 23 45 67 89",
        email: "contact@saint-aubin.fr",
        website: "https://saint-aubin.fr",
        defaultMeetingLocation: "Salle du conseil",
        timeZone: "Europe/Paris",
        outboundEmailSenderName: "Conseil municipal de Saint-Aubin",
        outboundEmailSenderAddress: "conseil@saint-aubin.fr",
        outboundEmailReplyToAddress: "secretariat@saint-aubin.fr",
        councilTerm: { expectedMemberCount: 15 },
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
        ["Alice", "Benoît", "Claire"].map(async (firstName) => {
          const contact = await contactRepository.create({
            firstName,
            lastName: "Martin",
            organizationName: null,
            jobTitle: null,
            email: null,
            phone: null,
            notes: "",
          });
          return councilMemberRepository.create({
            contactId: contact.id,
            role: "councillor",
            termStartedOn: "2026-03-22",
          });
        }),
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
      const geographic = await resourceRepository.createGeographic({
        title: "Project area",
        folderPath: "associations/grants",
        tags: ["map"],
        provider: "ign",
        layers: [
          { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 },
          { id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: false, opacity: 0.6 },
        ],
        view: { kind: "center", center: [2.15, 48.15], zoom: 15 },
        hallLayer: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: randomUUID(),
              properties: {
                kind: "marker",
                visible: true,
                label: "Town hall",
                style: { color: "#1b2a78", size: "medium" },
              },
              geometry: { type: "Point", coordinates: [2.15, 48.15] },
            },
          ],
        },
      });
      expect(await resourceRepository.findMetadata(geographic.id)).toMatchObject({
        id: geographic.id,
        kind: "geographic",
        version: 1,
      });
      expect(await resourceRepository.findGeographicData(geographic.id)).toMatchObject({
        view: { kind: "center", center: [2.15, 48.15], zoom: 15 },
        layers: [
          { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 },
          { id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: false, opacity: 0.6 },
        ],
        hallLayer: {
          type: "FeatureCollection",
          features: [expect.objectContaining({ properties: expect.objectContaining({ kind: "marker" }) })],
        },
      });
      const spreadsheetDocument = {
        schemaVersion: 2 as const,
        workbook: {
          id: "budget-workbook",
          name: "Budget",
          sheetOrder: ["budget"],
          sheets: {
            budget: {
              id: "budget",
              name: "Budget",
              rowCount: 20,
              columnCount: 8,
              cellData: { 1: { 2: { f: "=ROUND(A2*B2,2)" } } },
            },
          },
        },
      };
      const spreadsheet = await resourceRepository.createSpreadsheet({
        title: "Budget",
        folderPath: "associations/grants",
        tags: ["finance"],
        document: spreadsheetDocument,
      });
      expect(await resourceRepository.findSpreadsheetDocument(spreadsheet.id)).toEqual(spreadsheetDocument);
      expect(
        await resourceRepository.updateSpreadsheet(spreadsheet.id, {
          document: {
            ...spreadsheetDocument,
            workbook: {
              ...spreadsheetDocument.workbook,
              sheets: {
                budget: {
                  ...spreadsheetDocument.workbook.sheets.budget,
                  cellData: { 1: { 0: { v: 3 }, 2: { f: "=ROUND(A2*B2,2)" } } },
                },
              },
            },
          },
          expectedVersion: 1,
        }),
      ).toMatchObject({ status: "updated", resource: { version: 2 } });
      expect(
        await resourceRepository.updateSpreadsheet(spreadsheet.id, {
          document: spreadsheetDocument,
          expectedVersion: 1,
        }),
      ).toEqual({ status: "versionConflict" });
      const legalDraft = await resourceRepository.createLegalReferenceDraft({
        title: "CGCT L2121-10",
        folderPath: "associations/grants",
        tags: ["law"],
        provider: "legifrance",
        referenceKind: "article",
      });
      const legal = await resourceRepository.resolveLegalReference(legalDraft.id, {
        title: legalDraft.title,
        folderPath: legalDraft.folderPath,
        tags: legalDraft.tags,
        provider: "legifrance",
        referenceKind: "article",
        fund: "CODE_ETAT",
        sourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041410274",
        providerUpdatedAt: null,
        citationLabel: "CGCT, article L2121-10",
        attribution: "Source : DILA - Légifrance. Licence Ouverte 2.0.",
        snapshot: {
          commonId: "CID-L2121-10",
          versionId: "LEGIARTI000041410274",
          effectiveAt: null,
          fetchedAt: "2026-08-30T10:00:00.000Z",
          validFrom: "2020-01-01",
          validTo: null,
          legalStatus: "VIGUEUR",
          rawProviderPayload: JSON.stringify({ id: "LEGIARTI000041410274" }),
          normalizedContent: "Toute convocation est faite par le maire.",
          contentHash: createHash("sha256").update("Toute convocation est faite par le maire.").digest("hex"),
          snapshotHash: createHash("sha256").update("snapshot-v1").digest("hex"),
        },
      });
      expect(legal).not.toBeNull();
      if (!legal) throw new Error("Expected the legal reference draft to resolve");
      expect(await resourceRepository.findMetadata(legal.id)).toMatchObject({
        id: legal.id,
        kind: "legalReference",
      });
      expect(await resourceRepository.listLegalReferenceSnapshots(legal.id)).toEqual([
        expect.objectContaining({ versionId: "LEGIARTI000041410274" }),
      ]);
      const editorAsset = await resourceRepository.createEditorAsset({
        title: "Pasted plan",
        folderPath: text.folderPath,
        fileName: "clipboard.png",
        format: "png",
        mediaType: "image/png",
        contentSha256,
        owner: { kind: "textResourceContent", id: text.id },
        content: documentContent,
      });
      expect(editorAsset).toMatchObject({
        usage: "editorAsset",
        category: null,
        editorOwner: { kind: "textResourceContent", id: text.id },
      });
      expect(await resourceRepository.list()).toHaveLength(5);
      expect(
        await resourceRepository.list({
          usage: "editorAsset",
          editorOwner: { kind: "textResourceContent", id: text.id },
        }),
      ).toEqual([expect.objectContaining({ id: editorAsset.id })]);
      expect(
        await resourceRepository.reconcileEditorAssets({ kind: "textResourceContent", id: text.id }, [editorAsset.id]),
      ).toEqual([]);
      expect(await resourceRepository.isReferencedByRichText(editorAsset.id)).toBe(true);
      expect(await resourceRepository.reconcileEditorAssets({ kind: "textResourceContent", id: text.id }, [])).toEqual([
        editorAsset.id,
      ]);
      expect(await resourceRepository.findMetadata(editorAsset.id)).toBeNull();
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
