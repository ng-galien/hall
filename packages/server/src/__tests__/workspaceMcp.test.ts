import { describe, expect, it } from "vitest";
import { createTestMandateContact, createTestServer } from "./testServer.js";

const administrator = { email: "mcp-admin@example.fr", displayName: "MCP test", password: "Test-MCP-Password-2026!" };

describe("workspace MCP over HTTP", () => {
  it("speaks JSON-RPC and discovers workspace operations", async () => {
    const { agent } = await createTestServer();
    const rpc = (method: string, params: object) =>
      agent
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const init = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    }).expect(200);
    expect(init.body.result.serverInfo.name).toBe("hall-workspace");
    expect(init.body.properties).toBeUndefined();
    const tools = await rpc("tools/list", {}).expect(200);
    expect(tools.body.result.tools.map((tool: { name: string }) => tool.name)).toContain("workspace_execute");
    const call = async (name: string, args: object) => {
      const response = await rpc("tools/call", { name, arguments: args }).expect(200);
      return { ...JSON.parse(response.body.result.content[0].text), isError: response.body.result.isError };
    };
    const discover = await call("workspace_discover", {});
    expect(
      discover.actions.find((action: { name: string }) => action.name === "resource.update-content").inputSchema,
    ).toBeDefined();
    const external = await call("workspace_read", { href: "https://example.com/api/resources" });
    expect(external.isError).toBe(true);
    const outside = await call("workspace_read", { href: "/api/users" });
    expect(outside.isError).toBe(true);
  });

  it("requires authentication and preserves read-only permissions", async () => {
    const { agent, statelessAgent } = await createTestServer({ devAutoLogin: false });
    await statelessAgent.post("/mcp").send({}).expect(401);
    await agent.post("/api/auth/bootstrap").send(administrator).expect(201);
    await agent
      .post("/api/users")
      .send({
        email: "reader@example.fr",
        displayName: "Reader",
        password: administrator.password,
        roles: ["councillor"],
        contactId: await createTestMandateContact(agent),
      })
      .expect(201);
    const login = await statelessAgent
      .post("/api/auth/login")
      .send({ email: "reader@example.fr", password: administrator.password })
      .expect(200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const call = (name: string, args: object) =>
      statelessAgent
        .post("/mcp")
        .set("Cookie", cookie)
        .set("Accept", "application/json, text/event-stream")
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
    const read = await call("workspace_read", { href: "/api/resources" }).expect(200);
    expect(read.body.result.isError).toBeUndefined();
    const write = await call("workspace_execute", {
      href: "/api/resources",
      action: "resource.create",
      input: { kind: "text", path: "seed", name: "Forbidden", content: "" },
    }).expect(200);
    expect(write.body.result.isError).toBe(true);
    await statelessAgent
      .post("/mcp")
      .set("Cookie", cookie)
      .set("Origin", "https://attacker.example")
      .send({})
      .expect(403);
  });
});
