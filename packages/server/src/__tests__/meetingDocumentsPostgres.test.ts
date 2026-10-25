if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required; use the isolated test:postgres entry point");

import { randomUUID } from "node:crypto";
import { meetingDocumentResourceDetailSchema, meetingDocumentsSchema } from "@hall/api-contract";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { startHttpServer } from "../server.js";
import { resetPostgresTestDatabase } from "./support/postgresTestDatabase.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresTest = databaseUrl ? it : it.skip;
postgresTest(
  "HTTP meeting documents expose backend groups, readonly snapshot resources and canonical actions",
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    await resetPostgresTestDatabase(pool);
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
      devAutoLogin: false,
    });
    try {
      const bootstrap = await fetch(`${server.url}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: server.url },
        body: JSON.stringify({
          email: "admin@example.fr",
          displayName: "Administrator",
          password: "Test-administrator-2026!",
        }),
      });
      expect(bootstrap.status).toBe(201);
      const cookie = bootstrap.headers.get("set-cookie")!.split(";", 1)[0]!;
      const post = (path: string, body: unknown) =>
        fetch(server.url + path, {
          method: "POST",
          headers: { cookie, origin: server.url, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const get = (path: string) => fetch(server.url + path, { headers: { cookie } });
      const meetingResponse = await post("/api/council-meetings", {});
      expect(meetingResponse.status).toBe(201);
      const meeting = (await meetingResponse.json()).properties;
      const businessResponse = await post("/api/council-business", {
        path: "seed",
        name: "Roads",
        reportName: "Report",
        reportContent: "Original report",
      });
      expect(businessResponse.status).toBe(201);
      const business = (await businessResponse.json()).properties;
      const subjectResponse = await post(`/api/council-business/${business.id}/prepared-subjects`, {
        kind: "openQuestion",
        name: "Road works",
        content: "Question",
      });
      expect(subjectResponse.status).toBe(201);
      const subject = (await subjectResponse.json()).properties;
      const schedule = await post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`, {
        kind: "openQuestion",
        subjectId: subject.id,
        position: 1,
      });
      expect(schedule.status).toBe(201);
      const upload = new FormData();
      upload.set("file", new Blob(["%PDF-1.7\nMeeting document"], { type: "application/pdf" }), "document.pdf");
      upload.set("councilBusinessId", business.id);
      const uploadedResponse = await fetch(server.url + "/api/resources/documents", {
        method: "POST",
        headers: { cookie },
        body: upload,
      });
      expect(uploadedResponse.status).toBe(201);
      const uploaded = (await uploadedResponse.json()).properties;
      const base = `/api/council-meetings/${meeting.id}/documents`;
      const binaryContent = await get(`${base}/resources/${uploaded.id}/content`);
      expect(binaryContent.status).toBe(200);
      expect(binaryContent.headers.get("content-security-policy")).toBe("sandbox");
      expect(binaryContent.headers.get("x-content-type-options")).toBe("nosniff");
      const index = await get(base);
      expect(index.status).toBe(200);
      const entity = await index.json();
      expect(meetingDocumentsSchema.parse(entity.properties).groups.map((group) => group.kind)).toEqual([
        "noticeAndAgenda",
        "proxies",
        "decisions",
        "minutes",
        "resources",
        "businesses",
      ]);
      expect(entity.links).toContainEqual(expect.objectContaining({ rel: ["self"], href: base }));
      expect(entity.actions.map((action: { name: string }) => action.name)).toContain("meeting.schedule");
      expect(JSON.stringify(entity)).not.toMatch(
        /resource\.create|resource\.delete|council-business\.associate|council-business\.dissociate|meeting\.create-and-schedule-business|agenda-item\.schedule/,
      );
      expect(entity.entities.every((group: { actions: unknown[] }) => group.actions.length === 0)).toBe(true);
      const reportLeaf = entity.entities
        .flatMap((group: { entities: unknown[] }) => group.entities)
        .find((leaf: { properties: { id: string } }) => leaf.properties.id === business.reportResourceId);
      const reportLink = reportLeaf.links.find((link: { rel: string[] }) => link.rel.includes("self"));
      const report = await (await get(reportLink.href)).json();
      expect(meetingDocumentResourceDetailSchema.parse(report.properties).source).toEqual({ kind: "current" });
      expect(report.actions).toEqual([]);
      expect(report.properties.resource.content).toBe("Original report");
      expect((await get(`${base}/resources/${randomUUID()}`)).status).toBe(404);
      expect((await get(`${base}/resources/${business.reportResourceId}/content`)).status).toBe(404);
      expect((await fetch(server.url + base)).status).toBe(401);
      expect((await post(`${base}/resources`, { kind: "text", name: "Illegal" })).status).toBe(404);
      const canonical = await (await get(`/api/council-meetings/${meeting.id}`)).json();
      expect(canonical.links).toContainEqual(expect.objectContaining({ rel: ["documents"], href: base }));
    } finally {
      await server.close();
      await pool.end();
    }
  },
  120_000,
);
