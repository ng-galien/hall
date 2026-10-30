if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required; use the isolated test:postgres entry point");

import { Pool } from "pg";
import { expect, it } from "vitest";
import { startHttpServer } from "../server.js";
import { resetPostgresTestDatabase } from "./support/postgresTestDatabase.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M+ABzDhkAIAEwQCAiV7nNwAAAAASUVORK5CYII=",
  "base64",
);

// @verifies-requirement HALL-FR-WSP-460
it("HTTP numbers a photo imported in the same second as another photo of the same location", async () => {
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
    const cookie = bootstrap.headers.get("set-cookie")!.split(";", 1)[0];
    const name = "Photo du 2026-10-30 10-15-02.png";
    const importPhoto = (content: Buffer, numbered: boolean) => {
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(content)], { type: "image/png" }), name);
      form.set("path", "seed");
      form.set("name", name);
      if (numbered) form.set("onNameConflict", "suffix");
      return fetch(`${server.url}/api/resources/documents`, {
        method: "POST",
        headers: { cookie, origin: server.url },
        body: form,
      });
    };

    const names: string[] = [];
    for (const content of [png, png, Buffer.concat([png, Buffer.from([0])])]) {
      const response = await importPhoto(content, true);
      expect(response.status).toBe(201);
      const created = (await response.json()).properties as { kind: string; name: string; path: string };
      expect(created).toMatchObject({ kind: "document", path: "seed" });
      names.push(created.name);
    }
    expect(names).toEqual([
      "Photo du 2026-10-30 10-15-02.png",
      "Photo du 2026-10-30 10-15-02 (2).png",
      "Photo du 2026-10-30 10-15-02 (3).png",
    ]);
    const audited = await pool.query(
      "SELECT count(*)::int AS count FROM hall.audit_event WHERE action = 'resource.createDocument'",
    );
    expect(audited.rows[0].count).toBe(3);

    const refused = await importPhoto(png, false);
    expect(refused.status).toBe(409);
    await expect(refused.json()).resolves.toMatchObject({ code: "workspace_title_conflict" });
  } finally {
    await server.close();
    await pool.end();
  }
});
