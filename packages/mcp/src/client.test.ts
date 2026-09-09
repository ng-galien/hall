import { afterEach, expect, it, vi } from "vitest";
import { describeAction, workspaceActions } from "./actions.js";
import { WorkspaceClient } from "./client.js";

afterEach(() => vi.unstubAllGlobals());
it("confines requests and session credentials before fetching", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const client = new WorkspaceClient("https://hall.example", "secret");
  for (const href of [
    "https://other.example/api/resources",
    "/api/users",
    "/api/resources/../../users",
    "https://user:pass@hall.example/api/resources",
    "/api/resources/%2fusers",
  ])
    await expect(client.read(href)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  expect(() => new WorkspaceClient("http://remote.example")).toThrow();
});
it("provides an input schema for every supported action and classifies file operations", () => {
  for (const name of Object.keys(workspaceActions) as (keyof typeof workspaceActions)[])
    expect(describeAction(name).inputSchema).toBeDefined();
  expect(describeAction("resource.create-document").fileRequired).toBe(true);
  expect(describeAction("resource.update-content").fileRequired).toBe(false);
});
it("refuses unadvertised actions without sending a mutation", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ actions: [] }), { headers: { "content-type": "application/json" } }),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    new WorkspaceClient("https://hall.example").execute("/api/resources", "resource.delete", {}),
  ).rejects.toThrow("unavailable");
  expect(fetch).toHaveBeenCalledTimes(1);
});
