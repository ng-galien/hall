import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildContainer } from "../core/container.js";
import { startHttpServer } from "../server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required; use test:postgres");
const postgres = describe;
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
      await expect(response.json()).resolves.toEqual({ status: "ok", version: "unidentified" });

      const inspection = new Pool({ connectionString: ownerUrl });
      const schemas = await inspection.query<{ documentary: boolean; legacy: boolean }>(
        `SELECT to_regclass('hall.resource') IS NOT NULL AS documentary,
                to_regclass('public.contacts') IS NOT NULL AS legacy`,
      );
      await inspection.end();
      expect(schemas.rows).toEqual([{ documentary: true, legacy: false }]);
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

      const businessResponse = await fetch(`${server.url}/api/council-business`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          path: "school/menus",
          name: "Canteen",
          reportName: "Main report",
          reportContent: "Initial report",
        }),
      });
      expect(businessResponse.status).toBe(201);
      const businessRepresentation = (await businessResponse.json()) as {
        properties: { id: string; folderResourceId: string; reportResourceId: string };
        actions?: Array<{ name: string }>;
      };
      expect(businessRepresentation.properties).toEqual({
        id: expect.any(String),
        folderResourceId: expect.any(String),
        reportResourceId: expect.any(String),
      });
      expect((businessRepresentation.actions ?? []).map(({ name }) => name)).toEqual([
        "resource.create",
        "resource.import-spreadsheet",
        "resource.convert-spreadsheet-table",
        "resource.create-document",
        "council-business.associate-resource",
        "council-business.dissociate-resource",
        "council-business.reorder-resources",
        "council-business.associate-committee",
        "council-business.dissociate-committee",
        "council-business.create-prepared-subject",
        "council-business.schedule-decision-proposal",
        "council-business.schedule-open-question",
        "council-business.export-bundle",
        "council-business.delete",
        "council-business.merge",
      ]);

      const businessListResponse = await fetch(`${server.url}/api/council-business`);
      expect(businessListResponse.status).toBe(200);
      const businessListRepresentation = (await businessListResponse.json()) as {
        entities: Array<{ properties: Record<string, unknown> }>;
      };
      expect(businessListRepresentation.entities.map(({ properties }) => properties)).toEqual([
        businessRepresentation.properties,
      ]);

      const openedBusinessResponse = await fetch(
        `${server.url}/api/council-business/${businessRepresentation.properties.id}`,
      );
      expect(openedBusinessResponse.status).toBe(200);
      await expect(openedBusinessResponse.json()).resolves.toMatchObject({
        properties: businessRepresentation.properties,
      });

      const renamedBusinessFolderResponse = await fetch(
        `${server.url}/api/resources/${businessRepresentation.properties.folderResourceId}/location`,
        {
          method: "PATCH",
          headers: mutationHeaders,
          body: JSON.stringify({ path: "school/menus", name: "Canteen 2026" }),
        },
      );
      expect(renamedBusinessFolderResponse.status).toBe(200);

      const businessReferencesResponse = await fetch(
        `${server.url}/api/templates/references?type=councilBusiness&query=2026`,
      );
      expect(businessReferencesResponse.status).toBe(200);
      await expect(businessReferencesResponse.json()).resolves.toMatchObject({
        entities: [
          {
            properties: {
              type: "councilBusiness",
              id: businessRepresentation.properties.id,
              label: "Canteen 2026",
            },
          },
        ],
      });

      const [businessFolderResponse, businessReportResponse] = await Promise.all([
        fetch(`${server.url}/api/resources/${businessRepresentation.properties.folderResourceId}`),
        fetch(`${server.url}/api/resources/${businessRepresentation.properties.reportResourceId}`),
      ]);
      expect(businessFolderResponse.status).toBe(200);
      expect(businessReportResponse.status).toBe(200);
      await expect(businessFolderResponse.json()).resolves.toMatchObject({
        properties: { kind: "folder", name: "Canteen 2026", fullPath: "school/menus/Canteen 2026" },
      });
      await expect(businessReportResponse.json()).resolves.toMatchObject({
        properties: {
          kind: "text",
          name: "Main report",
          path: "school/menus/Canteen 2026",
          content: "Initial report",
        },
      });

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
          "resource.convert-spreadsheet-table",
          "resource.create-editor-asset",
          "resource.search-legal-references",
        ]),
      );
      expect(listRepresentation.entities.map(({ properties }) => properties)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ slug: "menu-septembre-md", name: "Menu septembre.md", kind: "text" }),
          expect.objectContaining({ name: "Canteen 2026", kind: "folder" }),
        ]),
      );
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

      const resourceReferencesResponse = await fetch(
        `${server.url}/api/templates/references?type=resource&query=septembre`,
      );
      expect(resourceReferencesResponse.status).toBe(200);
      await expect(resourceReferencesResponse.json()).resolves.toMatchObject({
        entities: [
          {
            properties: {
              type: "resource",
              id: createdRepresentation.properties.id,
              label: "Menu septembre.md",
            },
          },
        ],
      });

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

  it("serves contacts and normalized council mandates through PostgreSQL", async () => {
    await resetPostgres();
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
      devAutoLogin: true,
    });
    const mutationHeaders = { "content-type": "application/json", origin: server.url };
    const setup = new Pool({ connectionString: databaseUrl });
    try {
      const configured = await setup.query<{ term: { startedOn: string } }>(
        "SELECT hall_api.configure_active_council_term(1) AS term",
      );
      const termStartedOn = configured.rows[0]?.term.startedOn;
      if (!termStartedOn) throw new Error("Expected an active council term");

      const createContact = (firstName: string) =>
        fetch(`${server.url}/api/contacts`, {
          method: "POST",
          headers: mutationHeaders,
          body: JSON.stringify({
            firstName,
            lastName: "Martin",
            organizationName: null,
            jobTitle: null,
            email: null,
            phone: null,
            notes: "",
          }),
        });
      const firstResponse = await createContact("Ariane");
      const secondResponse = await createContact("Benoît");
      expect([firstResponse.status, secondResponse.status]).toEqual([201, 201]);
      const first = (await firstResponse.json()) as { properties: Record<string, unknown> };
      const second = (await secondResponse.json()) as { properties: Record<string, unknown> };
      expect(first.properties).not.toHaveProperty("activeCouncilMemberId");

      const memberResponse = await fetch(`${server.url}/api/council-members`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          contactId: first.properties.id,
          role: "mayor",
          termStartedOn,
        }),
      });
      expect(memberResponse.status).toBe(201);
      const member = (await memberResponse.json()) as { properties: Record<string, unknown> };
      expect(member.properties).toMatchObject({
        contactId: first.properties.id,
        role: "mayor",
        active: true,
        termStartedOn,
        termEndedOn: null,
      });
      expect(member.properties).not.toHaveProperty("contact");

      const contactsResponse = await fetch(`${server.url}/api/contacts`);
      const contacts = (await contactsResponse.json()) as {
        entities: Array<{ properties: { id: string }; actions?: Array<{ name: string }> }>;
      };
      const firstContact = contacts.entities.find(({ properties }) => properties.id === first.properties.id);
      const secondContact = contacts.entities.find(({ properties }) => properties.id === second.properties.id);
      expect(firstContact?.actions?.map(({ name }) => name)).toEqual(["contact.update"]);
      expect(secondContact?.actions?.map(({ name }) => name)).toEqual(["contact.update", "contact.archive"]);

      const committeeResponse = await fetch(`${server.url}/api/council-committees`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({ name: "Finances", description: "Préparation budgétaire" }),
      });
      expect(committeeResponse.status).toBe(201);
      const committee = (await committeeResponse.json()) as {
        properties: Record<string, unknown>;
        entities?: unknown[];
      };
      expect(committee.properties).not.toHaveProperty("slug");
      expect(committee.entities).toBeUndefined();
      const committeeId = committee.properties.id;

      const membershipResponse = await fetch(`${server.url}/api/council-committees/${committeeId}/memberships`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          contactId: member.properties.contactId,
          role: "chair",
          startedOn: termStartedOn,
        }),
      });
      expect(membershipResponse.status).toBe(201);
      const membership = (await membershipResponse.json()) as { properties: Record<string, unknown> };

      const membershipsResponse = await fetch(`${server.url}/api/council-committees/${committeeId}/memberships`);
      const memberships = (await membershipsResponse.json()) as {
        entities: Array<{ properties: Record<string, unknown>; actions?: Array<{ name: string }> }>;
      };
      expect(memberships.entities).toEqual([
        expect.objectContaining({
          properties: expect.objectContaining({
            id: membership.properties.id,
            committeeId,
            contactId: member.properties.contactId,
            role: "chair",
            endedOn: null,
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({ name: "committee.update-membership" }),
            expect.objectContaining({ name: "committee.end-membership" }),
          ]),
        }),
      ]);

      const committeeArchiveResponse = await fetch(`${server.url}/api/council-committees/${committeeId}/archive`, {
        method: "POST",
        headers: mutationHeaders,
      });
      expect(committeeArchiveResponse.status).toBe(200);
      const endedMembershipsResponse = await fetch(`${server.url}/api/council-committees/${committeeId}/memberships`);
      await expect(endedMembershipsResponse.json()).resolves.toMatchObject({
        entities: [{ properties: { id: membership.properties.id, endedOn: expect.any(String) } }],
      });

      const fullResponse = await fetch(`${server.url}/api/council-members`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          contactId: second.properties.id,
          role: "councillor",
          termStartedOn,
        }),
      });
      expect(fullResponse.status).toBe(409);
      await expect(fullResponse.json()).resolves.toMatchObject({ code: "council_term_capacity_reached" });

      const activeArchiveResponse = await fetch(`${server.url}/api/contacts/${first.properties.id}/archive`, {
        method: "POST",
        headers: mutationHeaders,
      });
      expect(activeArchiveResponse.status).toBe(409);
      await expect(activeArchiveResponse.json()).resolves.toMatchObject({
        code: "contact_has_active_council_membership",
      });

      const memberId = member.properties.id;
      const endedResponse = await fetch(`${server.url}/api/council-members/${memberId}`, {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify({
          role: "mayor",
          termStartedOn,
          termEndedOn: termStartedOn,
        }),
      });
      expect(endedResponse.status).toBe(200);
      const archiveResponse = await fetch(`${server.url}/api/contacts/${first.properties.id}/archive`, {
        method: "POST",
        headers: mutationHeaders,
      });
      expect(archiveResponse.status).toBe(200);

      const referenceResponse = await fetch(`${server.url}/api/templates/references?type=member&query=Ariane`);
      expect(referenceResponse.status).toBe(200);
      await expect(referenceResponse.json()).resolves.toMatchObject({
        entities: [
          {
            properties: {
              type: "member",
              id: memberId,
              label: "Ariane Martin",
            },
          },
        ],
      });
    } finally {
      await setup.end();
      await server.close();
    }
  });

  it("serves ballots as separately hydrated PostgreSQL resources", async () => {
    await resetPostgres();
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
      devAutoLogin: true,
    });
    const mutationHeaders = { "content-type": "application/json", origin: server.url };
    const setup = new Pool({ connectionString: databaseUrl });
    try {
      await setup.query("SELECT hall_api.configure_active_council_term(2)");
      const contactIds: string[] = [];
      for (const firstName of ["Alice", "Benoît"]) {
        const created = await setup.query<{ contact: { id: string } }>(
          "SELECT hall_api.create_contact($1, 'Martin', NULL, NULL, NULL, NULL, '') AS contact",
          [firstName],
        );
        contactIds.push(created.rows[0]!.contact.id);
      }
      const memberIds: string[] = [];
      for (const [index, contactId] of contactIds.entries()) {
        const created = await setup.query<{ member: { id: string } }>(
          "SELECT hall_api.create_council_member($1, $2, DATE '2026-01-01') AS member",
          [contactId, index === 0 ? "mayor" : "councillor"],
        );
        memberIds.push(created.rows[0]!.member.id);
      }

      const businessResponse = await fetch(`${server.url}/api/council-business`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          path: "",
          name: "Public ballot",
          reportName: "Main report",
          reportContent: "Proposal",
        }),
      });
      expect(businessResponse.status).toBe(201);
      const business = (await businessResponse.json()) as { properties: { id: string } };

      const meetingId = randomUUID();
      await setup.query("INSERT INTO hall.council_meetings (id) VALUES ($1)", [meetingId]);
      const agenda = await setup.query<{ item: { id: string } }>(
        "SELECT hall_api.schedule_council_decision_proposal($1, $2, 2) AS item",
        [business.properties.id, meetingId],
      );
      const agendaItemId = agenda.rows[0]!.item.id;
      const openQuestionAgenda = await setup.query<{ item: { id: string } }>(
        "SELECT hall_api.schedule_open_question($1, $2, 3) AS item",
        [business.properties.id, meetingId],
      );
      const openQuestionAgendaItemId = openQuestionAgenda.rows[0]!.item.id;
      const reorderResponse = await fetch(`${server.url}/api/council-meetings/${meetingId}/agenda-order`, {
        method: "PUT",
        headers: mutationHeaders,
        body: JSON.stringify({ agendaItemIds: [openQuestionAgendaItemId, agendaItemId] }),
      });
      expect(reorderResponse.status).toBe(200);
      await expect(reorderResponse.json()).resolves.toMatchObject({
        entities: [
          { properties: { id: openQuestionAgendaItemId, position: 2 } },
          { properties: { id: agendaItemId, position: 3 } },
        ],
      });
      await setup.query(
        "SELECT hall_api.schedule_council_meeting($1, TIMESTAMPTZ '2026-01-12 08:30:00+00', 'Council chamber')",
        [meetingId],
      );
      await setup.query("SELECT set_config('hall.actor_id','persistence-test',false)");
      await setup.query("SELECT hall_api.freeze_council_agenda($1)", [meetingId]);
      await setup.query(
        `SELECT hall_api.generate_meeting_notice(
          $1,
          jsonb_build_object(
            'meeting', hall_api.meeting_notice_facts($1),
            'hall', jsonb_build_object('name', 'Fixture commune', 'timeZone', 'Europe/Paris')
          ),
          convert_to('%PDF-persistence-fixture', 'UTF8')
        )`,
        [meetingId],
      );
      await setup.query("SELECT hall_api.record_meeting_opening($1, $2::jsonb, $3, $4)", [
        meetingId,
        JSON.stringify(memberIds.map((councilMemberId) => ({ council_member_id: councilMemberId, status: "present" }))),
        memberIds[0],
        memberIds[1],
      ]);
      const attendances = await setup.query<{ id: string; chair: boolean }>(
        "SELECT id::text, council_member = $2 AS chair FROM hall.meeting_attendance WHERE council_meeting = $1 ORDER BY council_member",
        [meetingId, memberIds[0]],
      );
      await setup.query("SELECT hall_api.start_council_agenda_item($1, clock_timestamp())", [openQuestionAgendaItemId]);
      await setup.query("SELECT hall_api.complete_non_voting_agenda_item($1, clock_timestamp())", [
        openQuestionAgendaItemId,
      ]);
      await setup.query("SELECT hall_api.start_council_agenda_item($1, clock_timestamp())", [agendaItemId]);

      const [attendanceResponse, agendaResponse] = await Promise.all([
        fetch(`${server.url}/api/council-meetings/${meetingId}/attendance`),
        fetch(`${server.url}/api/council-meetings/${meetingId}/agenda-items`),
      ]);
      expect([attendanceResponse.status, agendaResponse.status]).toEqual([200, 200]);
      await expect(attendanceResponse.json()).resolves.toMatchObject({
        entities: [
          { properties: { councilMeetingId: meetingId, status: "present" } },
          { properties: { councilMeetingId: meetingId, status: "present" } },
        ],
      });
      await expect(agendaResponse.json()).resolves.toMatchObject({
        entities: [
          {
            properties: {
              id: openQuestionAgendaItemId,
              councilBusinessId: business.properties.id,
              councilMeetingId: meetingId,
              position: 2,
              subject: { kind: "openQuestion" },
            },
          },
          {
            properties: {
              id: agendaItemId,
              councilBusinessId: business.properties.id,
              councilMeetingId: meetingId,
              position: 3,
              subject: { kind: "councilDecisionProposal" },
            },
          },
        ],
      });

      const previewResponse = await fetch(`${server.url}/api/ballot-previews`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          agendaItemId,
          candidate: {
            procedure: "ordinaryMajority",
            mode: "public",
            participantAttendanceIds: attendances.rows.map(({ id }) => id),
            votes: attendances.rows.map(({ id, chair }) => ({
              meetingAttendanceId: id,
              choice: chair ? "approve" : "reject",
            })),
            nonParticipations: [],
          },
        }),
      });
      expect(previewResponse.status).toBe(201);
      const preview = (await previewResponse.json()) as { properties: { id: string } };
      const beforeConfirmation = await fetch(`${server.url}/api/ballots?meetingId=${meetingId}`);
      await expect(beforeConfirmation.json()).resolves.toMatchObject({ entities: [] });
      const confirmResponse = await fetch(`${server.url}/api/ballot-previews/${preview.properties.id}/confirm`, {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({}),
      });
      expect(confirmResponse.status).toBe(200);
      const created = (await confirmResponse.json()) as {
        properties: {
          id: string;
          agendaItemId: string;
          mode: string;
          resultPreviewId: string;
          result: string;
          completedAt: string;
        };
      };
      expect(created.properties).toMatchObject({
        agendaItemId,
        mode: "public",
        resultPreviewId: preview.properties.id,
        result: "approve",
      });
      expect(Date.parse(created.properties.completedAt)).not.toBeNaN();

      const [listResponse, participationResponse] = await Promise.all([
        fetch(`${server.url}/api/ballots?meetingId=${meetingId}`),
        fetch(`${server.url}/api/ballots/${created.properties.id}/participations`),
      ]);
      expect([listResponse.status, participationResponse.status]).toEqual([200, 200]);
      const list = (await listResponse.json()) as { entities: Array<{ properties: { id: string } }> };
      const participations = (await participationResponse.json()) as {
        entities: Array<{ properties: { id: string } }>;
      };
      expect(list.entities.map(({ properties }) => properties.id)).toEqual([created.properties.id]);
      expect(participations.entities).toHaveLength(2);

      const votesResponse = await fetch(`${server.url}/api/ballots/${created.properties.id}/votes`);
      expect(votesResponse.status).toBe(200);
      await expect(votesResponse.json()).resolves.toMatchObject({ entities: [expect.any(Object), expect.any(Object)] });
    } finally {
      await setup.end();
      await server.close();
    }
  });
});
