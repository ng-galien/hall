import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceClient } from "../src/client.js";
import { createWorkspaceMcp } from "../src/server.js";

afterEach(() => vi.unstubAllGlobals());
// @verifies-requirement HALL-FR-EML-080
it("discovers mail, keeps send outside preparation and refuses stale or removed send capabilities", async () => {
  let allowed = true;
  const fetch = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          class: ["mail-preview"],
          properties: {},
          links: [{ rel: ["self"], href: "/api/mail/message/preview" }],
          actions: allowed
            ? [
                {
                  name: "mail.send",
                  method: "POST",
                  href: "/api/mail/message/send",
                  fields: [
                    { name: "expectedRevision", type: "hidden", value: 3 },
                    { name: "fingerprint", type: "hidden", value: "reviewed" },
                  ],
                },
              ]
            : [],
        }),
        { headers: { "content-type": "application/vnd.siren+json" } },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const server = createWorkspaceMcp(new WorkspaceClient("https://hall.example", "session-test"));
  const client = new Client({ name: "mail-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const discovery = await client.callTool({ name: "mail_discover", arguments: {} });
    expect(discovery.isError).not.toBe(true);
    expect(JSON.stringify(discovery)).toContain("/api/mail-recipient-groups");
    const input = {
      href: "/api/mail/message/preview",
      expectedRevision: 3,
      fingerprint: "reviewed",
      requestKey: "00000000-0000-4000-8000-000000000001",
    };
    const preparation = await client.callTool({
      name: "mail_execute",
      arguments: { href: input.href, action: "mail.send", input },
    });
    expect(preparation.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    const stale = await client.callTool({ name: "mail_send", arguments: { ...input, expectedRevision: 2 } });
    expect(stale.isError).toBe(true);
    expect(fetch.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(0);
    const sent = await client.callTool({ name: "mail_send", arguments: input });
    expect(sent.isError).not.toBe(true);
    expect(fetch.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    allowed = false;
    expect((await client.callTool({ name: "mail_send", arguments: input })).isError).toBe(true);
    expect(fetch.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    const post = fetch.mock.calls.find((call) => call[1]?.method === "POST")!;
    expect(new Headers(post[1]?.headers).get("Cookie")).toBe("hall_session=session-test");
  } finally {
    await client.close();
    await server.close();
  }
});
