import { PDFDocument } from "pdf-lib";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { startHttpServer } from "../server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresTest = databaseUrl ? it : it.skip;
postgresTest(
  "MCP organizes persisted resources with permissions, versions, imports and associations",
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
      const bootstrap = await fetch(`${server.url}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.fr", displayName: "Admin", password: "MCP-Test-Password-2026!" }),
      });
      expect(bootstrap.status).toBe(201);
      const cookie = bootstrap.headers.get("set-cookie")!.split(";")[0];
      const call = async (name: string, args: object, session = cookie) => {
        const response = await fetch(`${server.url}/mcp`, {
          method: "POST",
          headers: {
            cookie: session,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
        });
        expect(response.status).toBe(200);
        const rpc = await response.json();
        expect(rpc.error).toBeUndefined();
        const result = JSON.parse(rpc.result.content[0].text);
        return { ...result, isError: rpc.result.isError };
      };
      const execute = (href: string, action: string, input: object, file?: object) =>
        call("workspace_execute", { href, action, input, file });
      const folder = await execute("/api/resources", "resource.create", { kind: "folder", path: "", name: "seed" });
      expect(folder.isError, JSON.stringify(folder)).toBeUndefined();
      const contactResponse = await fetch(`${server.url}/api/contacts`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ firstName: "Camille", lastName: "Test" }),
      });
      expect(contactResponse.status).toBe(201);
      const contact = await contactResponse.json();
      const eventDocument = {
        content: "Préparer le rendez-vous",
        location: "Mairie",
        schedule: { kind: "allDay", start: "2026-09-09", end: "2026-09-10" },
        participants: [
          { kind: "contact", contactId: contact.properties.id },
          { kind: "guest", name: "Invité" },
        ],
      };
      const invalidSchedules = [
        { kind: "allDay", start: "2026-09-09", end: "2026-09-09" },
        { kind: "allDay", start: "2026-02-30", end: "2026-03-01" },
        { kind: "timed", start: "2026-09-10T11:00:00+02:00", end: "2026-09-10T10:00:00+02:00" },
      ];
      for (const schedule of invalidSchedules) {
        const invalidEvent = await execute("/api/resources", "resource.create", {
          kind: "event",
          path: "seed",
          name: "Invalid schedule",
          document: { ...eventDocument, schedule },
        });
        expect(invalidEvent.isError, JSON.stringify(invalidEvent)).toBe(true);
      }
      const missingContactEvent = await execute("/api/resources", "resource.create", {
        kind: "event",
        path: "seed",
        name: "Missing contact",
        document: {
          ...eventDocument,
          participants: [{ kind: "contact", contactId: "11111111-1111-4111-8111-111111111111" }],
        },
      });
      expect(missingContactEvent.isError, JSON.stringify(missingContactEvent)).toBe(true);
      const event = await execute("/api/resources?path=seed", "resource.create", {
        kind: "event",
        path: "seed",
        name: "Rendez-vous",
        document: eventDocument,
      });
      expect(event.isError, JSON.stringify(event)).toBeUndefined();
      const eventHref = `/api/resources/${event.properties.id}`;
      const eventRead = await call("workspace_read", { href: eventHref });
      expect(eventRead.properties.document).toEqual(eventDocument);
      const changedEventDocument = {
        ...eventDocument,
        content: "Rendez-vous confirmé",
        location: "Salle du conseil",
        schedule: { kind: "timed", start: "2026-09-10T10:00:00+02:00", end: "2026-09-10T11:00:00+02:00" },
      };
      const updatedEvent = await execute(eventHref, "resource.update-content", {
        kind: "event",
        expectedVersion: eventRead.properties.version,
        document: changedEventDocument,
      });
      expect(updatedEvent.properties?.document, JSON.stringify(updatedEvent)).toEqual(changedEventDocument);
      const staleEvent = await execute(eventHref, "resource.update-content", {
        kind: "event",
        expectedVersion: eventRead.properties.version,
        document: eventDocument,
      });
      expect(staleEvent.isError).toBe(true);
      const movedEvent = await execute(eventHref, "resource.relocate", { path: "", name: "Rendez-vous renommé" });
      expect(movedEvent.properties?.fullPath, JSON.stringify(movedEvent)).toBe("Rendez-vous renommé");
      const eventAfterMove = await call("workspace_read", { href: eventHref });
      expect(eventAfterMove.properties.document).toEqual(changedEventDocument);
      const text = await execute("/api/resources?path=seed", "resource.create", {
        kind: "text",
        path: "seed",
        name: "Note",
        content: "first",
      });
      expect(text.isError, JSON.stringify(text)).toBeUndefined();
      const href = `/api/resources/${text.properties.id}`;
      const updated = await execute(href, "resource.update-content", {
        kind: "text",
        expectedVersion: text.properties.version,
        content: "second",
      });
      expect(updated.properties.content).toBe("second");
      const stale = await execute(href, "resource.update-content", {
        kind: "text",
        expectedVersion: text.properties.version,
        content: "stale",
      });
      expect(stale.isError).toBe(true);
      const userResponse = await fetch(`${server.url}/api/users`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          email: "reader@example.fr",
          displayName: "Reader",
          password: "MCP-Test-Password-2026!",
          roles: ["reader"],
        }),
      });
      expect(userResponse.status).toBe(201);
      const login = await fetch(`${server.url}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "reader@example.fr", password: "MCP-Test-Password-2026!" }),
      });
      const readerCookie = login.headers.get("set-cookie")!.split(";")[0];
      const readerRead = await call("workspace_read", { href }, readerCookie);
      expect(readerRead.properties.content).toBe("second");
      const readerWrite = await call(
        "workspace_execute",
        {
          href,
          action: "resource.update-content",
          input: { kind: "text", expectedVersion: updated.properties.version, content: "Forbidden" },
        },
        readerCookie,
      );
      expect(readerWrite.isError).toBe(true);
      const readerEvent = await call("workspace_read", { href: eventHref }, readerCookie);
      expect(readerEvent.properties.document).toEqual(changedEventDocument);
      const readerEventWrite = await call(
        "workspace_execute",
        {
          href: eventHref,
          action: "resource.update-content",
          input: { kind: "event", expectedVersion: updatedEvent.properties.version, document: eventDocument },
        },
        readerCookie,
      );
      expect(readerEventWrite.isError).toBe(true);
      expect((await execute(eventHref, "resource.delete", {})).success).toBe(true);
      expect((await call("workspace_read", { href: eventHref })).isError).toBe(true);

      for (const kind of ["geographic", "spreadsheet"] as const) {
        const created = await execute("/api/resources", "resource.create", {
          kind,
          path: "seed",
          name: kind,
          ...(kind === "spreadsheet" ? { document: { schemaVersion: 2, workbook: {} } } : {}),
        });
        expect(created.isError, JSON.stringify(created)).toBeUndefined();
        const changed = await execute(`/api/resources/${created.properties.id}`, "resource.update-content", {
          kind,
          expectedVersion: created.properties.version,
          document: created.properties.document,
        });
        expect(changed.properties?.version, JSON.stringify({ kind, changed })).toBe(created.properties.version + 1);
      }
      const legal = await execute("/api/resources", "resource.create", {
        kind: "legalReference",
        path: "seed",
        name: "Legal reference",
      });
      expect(legal.properties.kind).toBe("legalReference");
      const legalWrite = await execute(`/api/resources/${legal.properties.id}`, "resource.update-content", {
        kind: "legalReference",
        expectedVersion: legal.properties.version,
        document: legal.properties.document,
      });
      expect(legalWrite.isError).toBe(true);
      const remote = await execute("/api/resources", "resource.create", {
        kind: "remote",
        path: "seed",
        name: "Remote",
        target: { kind: "unconfigured" },
      });
      const remoteChanged = await execute(`/api/resources/${remote.properties.id}`, "resource.update-content", {
        kind: "remote",
        expectedVersion: remote.properties.version,
        target: { kind: "url", url: "https://example.com" },
      });
      expect(remoteChanged.properties.target.url).toBe("https://example.com");
      await execute("/api/resources", "resource.create", { kind: "folder", path: "seed", name: "subfolder" });
      const moved = await execute(href, "resource.relocate", { path: "seed/subfolder", name: "Renamed" });
      expect(moved.properties?.fullPath, JSON.stringify(moved)).toBe("seed/subfolder/Renamed");
      const business = await execute("/api/council-business", "council-business.create", {
        path: "seed",
        name: "Business",
        reportName: "Report",
        reportContent: "Report",
      });
      expect(business.isError, JSON.stringify(business)).toBeUndefined();
      const businessHref = `/api/council-business/${business.properties.id}`;
      const attached = await execute(businessHref, "resource.create", {
        kind: "text",
        path: "seed",
        name: "Attached",
        content: "Evidence",
      });
      expect(attached.isError, JSON.stringify(attached)).toBeUndefined();
      const associations = await call("workspace_read", { href: `${businessHref}/resources` });
      expect(JSON.stringify(associations)).toContain(attached.properties.id);
      for (const kind of ["councilDecisionProposal", "openQuestion"]) {
        const subject = await execute(businessHref, "council-business.create-prepared-subject", {
          kind,
          name: kind,
          content: "Prepared text",
        });
        expect(subject.properties.kind, JSON.stringify(subject)).toBe(kind);
      }
      const associated = await execute(businessHref, "council-business.associate-resource", {
        resourceId: text.properties.id,
      });
      expect(associated.isError, JSON.stringify(associated)).toBeUndefined();
      const orderedResources = await call("workspace_read", { href: `${businessHref}/resources` });
      const reordered = await execute(businessHref, "council-business.reorder-resources", {
        resourceIds: orderedResources.entities
          .map((entry: { properties: { resourceId: string } }) => entry.properties.resourceId)
          .reverse(),
      });
      expect(reordered.isError, JSON.stringify(reordered)).toBeUndefined();
      const dissociated = await execute(businessHref, "council-business.dissociate-resource", {
        resourceId: text.properties.id,
      });
      expect(dissociated.isError, JSON.stringify(dissociated)).toBeUndefined();
      const conflict = await execute(businessHref, "resource.create", {
        kind: "text",
        path: "seed",
        name: "Conflict",
        content: "",
        councilBusinessId: text.properties.id,
      });
      expect(conflict.isError).toBe(true);
      const csv = {
        name: "table.csv",
        base64: Buffer.from("Name,Value\nExample,42\n").toString("base64"),
        mediaType: "text/csv",
      };
      const imported = await execute(businessHref, "resource.import-spreadsheet", { path: "seed", name: "Table" }, csv);
      expect(imported.properties.kind, JSON.stringify(imported)).toBe("spreadsheet");
      const pdf = await PDFDocument.create();
      pdf.addPage();
      const pdfFile = {
        name: "document.pdf",
        mediaType: "application/pdf",
        base64: Buffer.from(await pdf.save()).toString("base64"),
      };
      const doc = await execute(
        businessHref,
        "resource.create-document",
        { path: "seed", name: "PDF document" },
        pdfFile,
      );
      expect(doc.properties.kind, JSON.stringify(doc)).toBe("document");
      const binary = await call("workspace_read_binary", {
        href: `/api/resources/${doc.properties.id}/content`,
        length: 4,
      });
      expect(binary.base64).toBe(Buffer.from("%PDF").toString("base64"));
      const replaced = await execute(
        `/api/resources/${doc.properties.id}`,
        "resource.replace-document-content",
        {},
        pdfFile,
      );
      expect(replaced.isError, JSON.stringify(replaced)).toBeUndefined();
      const importedUpdate = await execute(`/api/resources/${imported.properties.id}`, "resource.update-content", {
        kind: "spreadsheet",
        expectedVersion: imported.properties.version,
        document: imported.properties.document,
      });
      expect(importedUpdate.properties.version).toBe(imported.properties.version + 1);
      const asset = await execute(
        "/api/resources",
        "resource.create-editor-asset",
        { ownerKind: "textResourceContent", ownerId: text.properties.id, title: "Illustration" },
        {
          name: "pixel.png",
          mediaType: "image/png",
          base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=",
        },
      );
      expect(asset.isError, JSON.stringify(asset)).toBeUndefined();
      const assetBytes = await call("workspace_read_binary", {
        href: `/api/resources/editor-assets/${asset.properties.id}/content`,
      });
      expect(assetBytes.mediaType).toBe("image/png");
      const deleted = await execute(href, "resource.delete", {});
      expect(deleted.success).toBe(true);
    } finally {
      await server.close();
      await pool.end();
    }
  },
  60000,
);
