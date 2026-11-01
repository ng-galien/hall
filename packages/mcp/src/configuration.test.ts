import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceClient } from "./client.js";
import { createWorkspaceMcp } from "./server.js";

afterEach(() => vi.unstubAllGlobals());
// @verifies-requirement HALL-FR-CFG-020
it("discovers configuration, persists a template through its advertised action and refuses a removed capability", async () => {
  let template = {
    kind: "pdf",
    documentType: "document-print",
    name: "Print",
    bodyMarkdown: "::generated-content",
    subject: null,
    stylesheet: "",
    headerHtml: "",
    footerHtml: "",
  };
  let allowed = true;
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT") template = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        class: ["template"],
        properties: template,
        links: [{ rel: ["self"], href: "/api/templates/one" }],
        actions: allowed
          ? [{ name: "template.update", method: "PUT", href: "/api/templates/one", type: "application/json" }]
          : [],
      }),
      { headers: { "content-type": "application/vnd.siren+json" } },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const server = createWorkspaceMcp(new WorkspaceClient("https://hall.example", "session-test"));
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["configuration_discover", "configuration_read", "configuration_execute"]),
    );
    const discovered = await client.callTool({ name: "configuration_discover", arguments: {} });
    expect(JSON.stringify(discovered)).toContain("settings.update");
    const edited = await client.callTool({
      name: "configuration_execute",
      arguments: {
        href: "/api/templates/one",
        action: "template.update",
        input: { ...template, headerHtml: "<div>Saved header</div>" },
      },
    });
    expect(edited.isError).not.toBe(true);
    const reread = await client.callTool({ name: "configuration_read", arguments: { href: "/api/templates/one" } });
    expect(JSON.stringify(reread)).toContain("Saved header");
    expect(new Headers(fetch.mock.calls.find((call) => call[1]?.method === "PUT")?.[1]?.headers).get("Cookie")).toBe(
      "hall_session=session-test",
    );
    allowed = false;
    const mutations = fetch.mock.calls.filter((call) => call[1]?.method === "PUT").length;
    const denied = await client.callTool({
      name: "configuration_execute",
      arguments: { href: "/api/templates/one", action: "template.update", input: template },
    });
    expect(denied.isError).toBe(true);
    expect(fetch.mock.calls.filter((call) => call[1]?.method === "PUT")).toHaveLength(mutations);
  } finally {
    await client.close();
    await server.close();
  }
});
