import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { startLocalHttpServer } from "../core/localServer.js";
import { startEmbeddedPostgresRuntime } from "../infrastructure/database/embeddedPostgresRuntime.js";

// @verifies-requirement HALL-TR-DSK-010
it("persists local affairs and concurrent resources across an idempotent shutdown and restart", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "hall-local-server-"));
  const clientDirectory = join(dataDirectory, ".client");
  await mkdir(clientDirectory);
  await writeFile(join(clientDirectory, "index.html"), "<h1>Local Hall</h1>");
  let server = await startLocalHttpServer({ dataDirectory, clientDirectory });
  try {
    const workspace = await fetch(`${server.url}/app/workspace`);
    expect(workspace.status).toBe(200);
    expect(await workspace.text()).toContain("Local Hall");
    const bootstrap = await fetch(`${server.url}/api/auth/bootstrap`, {
      method: "POST",
      headers: { origin: server.url, "content-type": "application/json" },
      body: JSON.stringify({ email: "local@example.fr", displayName: "Local", password: "Local-test-password-2026!" }),
    });
    expect(bootstrap.status).toBe(201);
    const cookie = bootstrap.headers.get("set-cookie")!.split(";", 1)[0];
    const post = (path: string, body: unknown) =>
      fetch(`${server.url}${path}`, {
        method: "POST",
        headers: { cookie, origin: server.url, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const businessResponse = await post("/api/council-business", {
      path: "seed",
      name: "Local affair",
      reportName: "Report",
      reportContent: "Persistent report",
    });
    expect(businessResponse.status, await businessResponse.clone().text()).toBe(201);
    const business = await businessResponse.json();
    const created = await Promise.all(
      ["First", "Second"].map(async (name) => {
        const response = await post("/api/resources", {
          kind: "text",
          path: "seed",
          name,
          content: name,
          councilBusinessId: business.properties.id,
        });
        expect(response.status).toBe(201);
        return response.json();
      }),
    );
    expect(created[0].properties.id).not.toBe(created[1].properties.id);
    const workspaceReads = await Promise.all(
      [
        "/api/auth/session",
        "/api/resources",
        "/api/council-business",
        "/api/settings",
        ...created.map((resource) => `/api/resources/${resource.properties.id}`),
      ].map((path) =>
        fetch(`${server.url}${path}`, { headers: { cookie } }).then(async (response) => ({
          path,
          status: response.status,
          body: await response.text(),
        })),
      ),
    );
    expect(workspaceReads.filter((response) => response.status !== 200)).toEqual([]);
    const form = new FormData();
    form.set("file", new Blob(["Local bytes"]), "local.txt");
    form.set("path", "seed");
    form.set("councilBusinessId", business.properties.id);
    const documentResponse = await fetch(`${server.url}/api/resources/documents`, {
      method: "POST",
      headers: { cookie, origin: server.url },
      body: form,
    });
    expect(documentResponse.status).toBe(201);
    const document = await documentResponse.json();
    const oldUrl = server.url;
    await Promise.all([server.close(), server.close()]);
    await expect(fetch(`${oldUrl}/api/health`)).rejects.toThrow();
    server = await startLocalHttpServer({ dataDirectory });
    for (const path of [
      `/api/council-business/${business.properties.id}`,
      ...created.map((resource) => `/api/resources/${resource.properties.id}`),
      `/api/resources/${document.properties.id}`,
    ]) {
      const response = await fetch(`${server.url}${path}`, { headers: { cookie } });
      expect(response.status).toBe(200);
    }
    await server.close();
    const database = await startEmbeddedPostgresRuntime(dataDirectory);
    try {
      const binaries = await database.pool.query<{ content: string }>(
        "SELECT convert_from(content, 'UTF8') content FROM hall.binary_object",
      );
      expect(binaries.rows).toContainEqual({ content: "Local bytes" });
      const associations = await database.pool.query<{ count: number }>(
        "SELECT count(*)::int count FROM hall.council_business_resource WHERE council_business=$1",
        [business.properties.id],
      );
      expect(associations.rows).toEqual([{ count: 3 }]);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await expect(database.pool.query("SELECT 1 / $1::int", [0])).rejects.toThrow("division by zero");
        expect((await database.pool.query<{ value: number }>("SELECT $1::int AS value", [attempt])).rows).toEqual([
          { value: attempt },
        ]);
      }
    } finally {
      await database.close();
    }
  } finally {
    await server.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
}, 120_000);

it("closes a failed local startup without resetting an incompatible database", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "hall-local-failure-"));
  try {
    const server = await startLocalHttpServer({ dataDirectory });
    await server.close();
    const database = await startEmbeddedPostgresRuntime(dataDirectory);
    const fingerprint = await database.pool.query<{ manifest_sha256: string }>(
      "SELECT manifest_sha256 FROM hall_meta.schema_contract",
    );
    await database.pool.query("UPDATE hall_meta.schema_contract SET manifest_sha256=repeat('0', 64)");
    await database.close();
    await expect(startLocalHttpServer({ dataDirectory })).rejects.toThrow("schema fingerprint differs");
    const reopened = await startEmbeddedPostgresRuntime(dataDirectory);
    try {
      expect((await reopened.pool.query("SELECT manifest_sha256 FROM hall_meta.schema_contract")).rows).toEqual([
        { manifest_sha256: "0".repeat(64) },
      ]);
      await reopened.pool.query("UPDATE hall_meta.schema_contract SET manifest_sha256=$1", [
        fingerprint.rows[0].manifest_sha256,
      ]);
    } finally {
      await reopened.close();
    }
    const recovered = await startLocalHttpServer({ dataDirectory });
    await recovered.close();
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
}, 120_000);
