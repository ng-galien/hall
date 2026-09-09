import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { startHttpServer } from "../server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresTest = databaseUrl ? it : it.skip;
postgresTest(
  "HTTP creates autonomous subjects and atomically attaches created and imported business resources",
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query(
      "DROP SCHEMA IF EXISTS hall_api CASCADE; DROP SCHEMA IF EXISTS hall CASCADE; DROP SCHEMA IF EXISTS hall_meta CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public",
    );
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
      devAutoLogin: false,
    });
    try {
      const bootstrap = await fetch(server.url + "/api/auth/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json", origin: server.url },
        body: JSON.stringify({
          email: "admin@example.fr",
          displayName: "Administrator",
          password: "Test-administrator-2026!",
        }),
      });
      expect(bootstrap.status).toBe(201);
      const cookie = bootstrap.headers.get("set-cookie")!.split(";", 1)[0];
      const post = (path: string, body: unknown) =>
        fetch(server.url + path, {
          method: "POST",
          headers: { cookie, origin: server.url, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const businessResponse = await post("/api/council-business", {
        path: "seed",
        name: "Business",
        reportName: "Report",
        reportContent: "Original report",
      });
      expect(businessResponse.status).toBe(201);
      const business = await businessResponse.json();
      const councilBusinessId = business.properties.id;
      const actions = business.actions as { name: string; fields?: { name: string; value?: unknown }[] }[];
      for (const name of ["resource.create", "resource.create-document", "resource.import-spreadsheet"]) {
        expect(actions.find((action) => action.name === name)?.fields).toContainEqual({
          name: "councilBusinessId",
          type: "hidden",
          value: councilBusinessId,
        });
      }
      const subjectIds: string[] = [];
      for (const kind of ["councilDecisionProposal", "openQuestion"]) {
        for (let index = 0; index < 2; index += 1) {
          const response = await post(`/api/council-business/${councilBusinessId}/prepared-subjects`, {
            kind,
            name: `${kind} ${index}`,
            content: `Content ${index}`,
          });
          expect(response.status).toBe(201);
          const result = await response.json();
          expect(result.properties).toMatchObject({ kind, councilBusinessId, content: `Content ${index}` });
          subjectIds.push(result.properties.id);
        }
      }
      expect(new Set(subjectIds).size).toBe(4);
      expect((await pool.query("SELECT count(*)::int n FROM hall.council_agenda_item")).rows[0].n).toBe(0);
      const createdIds: string[] = [];
      const text = await post("/api/resources", {
        kind: "text",
        path: "seed/elsewhere",
        name: "Note",
        content: "Evidence",
        councilBusinessId,
      });
      expect(text.status).toBe(201);
      createdIds.push((await text.json()).properties.id);
      for (const input of [
        { endpoint: "/api/resources/documents", fileName: "evidence.txt", content: "Original evidence" },
        { endpoint: "/api/resources/spreadsheets/import", fileName: "budget.csv", content: "Item,Amount\nWorks,100\n" },
      ]) {
        const form = new FormData();
        form.set("file", new Blob([input.content]), input.fileName);
        form.set("path", "seed/elsewhere");
        form.set("councilBusinessId", councilBusinessId);
        const response = await fetch(server.url + input.endpoint, {
          method: "POST",
          headers: { cookie, origin: server.url },
          body: form,
        });
        expect(response.status).toBe(201);
        createdIds.push((await response.json()).properties.id);
      }
      expect(createdIds.every(Boolean)).toBe(true);
      const attached = await pool.query(
        "SELECT resource FROM hall.council_business_resource WHERE council_business=$1 AND resource=ANY($2::uuid[])",
        [councilBusinessId, createdIds],
      );
      expect(attached.rowCount).toBe(3);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int n FROM hall.resource WHERE id=ANY($1::uuid[]) AND path='seed/elsewhere'",
            [createdIds],
          )
        ).rows[0].n,
      ).toBe(3);
      const counts = async () =>
        (
          await pool.query(
            "SELECT (SELECT count(*)::int FROM hall.resource) resources, (SELECT count(*)::int FROM hall.binary_object) binaries, (SELECT count(*)::int FROM hall.council_business_resource) associations",
          )
        ).rows[0];
      const beforeFailure = await counts();
      const failedText = await post("/api/resources", {
        kind: "text",
        path: "seed/must-rollback",
        name: "Orphan",
        content: "Must rollback",
        councilBusinessId: randomUUID(),
      });
      expect(failedText.status).toBe(409);
      expect(await counts()).toEqual(beforeFailure);
      const form = new FormData();
      form.set("file", new Blob(["New unique rejected bytes"]), "rejected.txt");
      form.set("path", "seed/must-rollback");
      form.set("councilBusinessId", randomUUID());
      const failedDocument = await fetch(server.url + "/api/resources/documents", {
        method: "POST",
        headers: { cookie, origin: server.url },
        body: form,
      });
      expect(failedDocument.status).toBe(409);
      expect(await counts()).toEqual(beforeFailure);
      const folder = await post("/api/resources", {
        kind: "folder",
        path: "seed",
        name: "Not a working resource",
        councilBusinessId,
      });
      expect(folder.status).toBe(400);
      expect(await counts()).toEqual(beforeFailure);
      const standalone = await post("/api/resources", {
        kind: "text",
        path: "seed",
        name: "Standalone",
        content: "Unattached",
      });
      expect(standalone.status).toBe(201);
      const standaloneId = (await standalone.json()).properties.id;
      expect(
        (
          await pool.query("SELECT count(*)::int n FROM hall.council_business_resource WHERE resource=$1", [
            standaloneId,
          ])
        ).rows[0].n,
      ).toBe(0);
      const denied = await fetch(server.url + "/api/resources", {
        method: "POST",
        headers: { origin: server.url, "content-type": "application/json" },
        body: JSON.stringify({ kind: "text", path: "seed", name: "Denied", content: "", councilBusinessId }),
      });
      expect(denied.status).toBe(401);
    } finally {
      await server.close();
      await pool.end();
    }
  },
  60000,
);
