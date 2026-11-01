import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it, vi } from "vitest";
import { createWorkspaceMcp, WorkspaceClient } from "../src/server.js";

// @verifies-requirement HALL-FR-WSP-470
it("teaches the current capabilities without reading instance data and maps unknown topics", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Guide must not read Hall data"));
  const server = createWorkspaceMcp(new WorkspaceClient("https://hall.example"));
  const client = new Client({ name: "guide-test", version: "1" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(right);
  await client.connect(left);
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("hall_learn");
    const overview = await client.callTool({ name: "hall_learn", arguments: {} });
    expect(overview.isError).not.toBe(true);
    expect(JSON.stringify(overview)).toContain("workspace_discover");
    expect(JSON.stringify(overview)).toContain("Windows private storage");
    for (const topic of ["connection", "model", "documents", "configuration", "meetings", "protocol"]) {
      const learned = await client.callTool({ name: "hall_learn", arguments: { topic } });
      expect(learned.isError).not.toBe(true);
      expect(JSON.stringify(learned)).toContain(topic);
    }
    expect(JSON.stringify(await client.callTool({ name: "hall_learn", arguments: { topic: "missing" } }))).toContain(
      "unknownTopic",
    );
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await server.close();
    fetch.mockRestore();
  }
});
