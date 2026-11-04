import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DemonstrationWorkspaceClient,
  publishDemonstrationConnection,
  withdrawDemonstrationConnection,
} from "./demonstration.js";
import { createWorkspaceMcp } from "./server.js";

let configuration: string;
const expiresAt = new Date(Date.now() + 3600_000).toISOString();

beforeEach(async () => {
  configuration = await mkdtemp(join(tmpdir(), "hall-mcp-demonstration-"));
  vi.stubEnv("XDG_CONFIG_HOME", configuration);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(configuration, { recursive: true, force: true });
});

// @verifies-requirement HALL-FR-WSP-470
it("follows the published demonstration across a restart on another port without reconfiguring the client", async () => {
  const fetch = vi.fn(async (url: URL) =>
    Response.json({ class: ["collection"], properties: { origin: url.origin } }, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  const server = createWorkspaceMcp(new DemonstrationWorkspaceClient());
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const closed = await client.callTool({ name: "workspace_read", arguments: { href: "/api/resources" } });
    expect(closed.isError).toBe(true);
    expect(JSON.stringify(closed)).toContain("Open Hall (demonstration edition)");

    await publishDemonstrationConnection({ origin: "http://127.0.0.1:50001", token: "first", expiresAt });
    const directory = join(configuration, "hall", "mcp");
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(directory, "demonstration.json"))).mode & 0o777).toBe(0o600);
    const first = await client.callTool({ name: "workspace_read", arguments: { href: "/api/resources" } });
    expect(JSON.stringify(first)).toContain("50001");
    expect(new Headers(fetch.mock.calls.at(-1)?.[1]?.headers).get("Cookie")).toBe("hall_session=first");

    await publishDemonstrationConnection({ origin: "http://127.0.0.1:50002", token: "second", expiresAt });
    const second = await client.callTool({ name: "workspace_read", arguments: { href: "/api/resources" } });
    expect(JSON.stringify(second)).toContain("50002");
    expect(new Headers(fetch.mock.calls.at(-1)?.[1]?.headers).get("Cookie")).toBe("hall_session=second");

    await withdrawDemonstrationConnection("http://127.0.0.1:50001");
    expect((await stat(join(directory, "demonstration.json"))).isFile()).toBe(true);
    await withdrawDemonstrationConnection("http://127.0.0.1:50002");
    const withdrawn = await client.callTool({ name: "workspace_read", arguments: { href: "/api/resources" } });
    expect(JSON.stringify(withdrawn)).toContain("Open Hall (demonstration edition)");
  } finally {
    await client.close();
    await server.close();
  }
});

it("publishes only a loopback http origin", async () => {
  await expect(
    publishDemonstrationConnection({ origin: "https://hall.example", token: "secret", expiresAt }),
  ).rejects.toThrow("loopback");
  await expect(
    publishDemonstrationConnection({ origin: "http://192.168.1.10:3000", token: "secret", expiresAt }),
  ).rejects.toThrow("loopback");
});
