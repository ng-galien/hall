import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalHttpServer } from "@hall/server";
import { Client } from "pg";
import { expect, it } from "vitest";
import { startEmbeddedPostgresRuntime } from "../../server/src/infrastructure/database/embeddedPostgresRuntime.js";
import { openDemonstration, signInToDemonstration } from "../src/demonstration.js";

// @verifies-requirement HALL-TR-DSK-010
it("recreates an incompatible same-version demonstration and then reuses its compatible replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "hall-demo-schema-fixture-"));
  const dataDirectory = join(root, "postgres");
  const profile = {
    userDataPath: root,
    applicationVersion: "1.0.0",
    startServer: () => startLocalHttpServer({ dataDirectory }),
  };
  let opened: Awaited<ReturnType<typeof openDemonstration>> | undefined;
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresRuntime>> | undefined;
  const headers = async (demo: NonNullable<typeof opened>) => {
    const cookie = await signInToDemonstration(demo.server, demo.state);
    return { cookie: `${cookie.name}=${cookie.value}` };
  };
  try {
    opened = await openDemonstration(profile);
    const oldResources = await fetch(`${opened.server.url}/api/resources`, { headers: await headers(opened) });
    expect(oldResources.status).toBe(200);
    const oldId = (await oldResources.json()).entities[0].properties.id;
    await writeFile(join(dataDirectory, "previous-fictional-data"), "discard on schema incompatibility");
    await writeFile(join(root, "unrelated"), "keep");
    await opened.server.close();
    opened = undefined;
    database = await startEmbeddedPostgresRuntime(dataDirectory);
    const fixture = new Client({ connectionString: database.url });
    await fixture.connect();
    try {
      const changed = await fixture.query("UPDATE hall_meta.schema_contract SET manifest_sha256=repeat('0',64)");
      expect(changed.rowCount).toBe(1);
    } finally {
      await fixture.end();
    }
    await database.close();
    database = undefined;
    const onPlan = (await import("vitest")).vi.fn();
    opened = await openDemonstration({ ...profile, onPlan });
    expect(onPlan.mock.calls).toEqual([[false], [true]]);
    expect((await fetch(`${opened.server.url}/api/health`)).status).toBe(200);
    await expect(access(join(dataDirectory, "previous-fictional-data"))).rejects.toThrow();
    await expect(access(join(root, "unrelated"))).resolves.toBeUndefined();
    const cookie = await headers(opened);
    expect((await fetch(`${opened.server.url}/api/resources/${oldId}`, { headers: cookie })).status).toBe(404);
    const replacement = await fetch(`${opened.server.url}/api/resources`, { headers: cookie });
    expect(replacement.status).toBe(200);
    const newId = (await replacement.json()).entities[0].properties.id;
    const state = opened.state;
    await opened.server.close();
    opened = undefined;
    onPlan.mockClear();
    opened = await openDemonstration({ ...profile, onPlan });
    expect(onPlan.mock.calls).toEqual([[false]]);
    expect(opened.state).toEqual(state);
    expect(
      (await fetch(`${opened.server.url}/api/resources/${newId}`, { headers: await headers(opened) })).status,
    ).toBe(200);
  } finally {
    await opened?.server.close();
    await database?.close();
    await rm(root, { recursive: true, force: true });
  }
}, 240_000);
