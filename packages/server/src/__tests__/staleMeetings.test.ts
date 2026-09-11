import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { startLocalHttpServer } from "../core/localServer.js";

// TODO REMOVE_STALE: temporary succession HTTP acceptance, including repeat/concurrent requests.
it("marks historical meetings stale without producing minutes or multiple active successors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hall-stale-"));
  const server = await startLocalHttpServer({ dataDirectory: directory });
  try {
    let cookie = "";
    const call = async (path: string, method = "GET", body?: unknown, expected = 200) => {
      const response = await fetch(`${server.url}/api${path}`, {
        method,
        headers: { origin: server.url, cookie, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie")!.split(";", 1)[0];
      const value = await response.json();
      expect(response.status, JSON.stringify(value)).toBe(expected);
      return value;
    };
    await call(
      "/auth/bootstrap",
      "POST",
      { email: "admin@stale.test", displayName: "Admin", password: "Stale-test-password-2026!" },
      201,
    );
    const first = await call("/council-meetings", "POST", {}, 201);
    expect(first.properties.stale).toBe(false);
    expect(first.actions.some((a: { name: string }) => a.name === "meeting.mark-stale")).toBe(true);
    const [one, two] = await Promise.all(
      [1, 2].map(() => call(`/council-meetings/${first.properties.id}/stale`, "POST", {})),
    );
    expect(one.properties.nextMeeting.id).toBe(two.properties.nextMeeting.id);
    expect(one.properties.staleMeeting).toMatchObject({ stale: true, closedAt: null, minutesId: null });
    await call(`/council-meetings/${one.properties.nextMeeting.id}/stale`, "POST", {});
    const listed = await call("/council-meetings");
    const meetings = listed.entities.map(
      (e: { properties: { stale: boolean; closedAt: string | null } }) => e.properties,
    );
    expect(meetings.filter((m: { stale: boolean }) => m.stale)).toHaveLength(2);
    expect(meetings.filter((m: { stale: boolean; closedAt: string | null }) => !m.stale && !m.closedAt)).toHaveLength(
      1,
    );
    const original = await call(`/council-meetings/${first.properties.id}`);
    expect(original.properties).toMatchObject({ stale: true, closedAt: null, minutesId: null });
    expect(original.actions.some((a: { name: string }) => a.name === "meeting.mark-stale")).toBe(false);
    expect((await call(`/council-meetings/${first.properties.id}/agenda-items`)).entities ?? []).toHaveLength(0);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
