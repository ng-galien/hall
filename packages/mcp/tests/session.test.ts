import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { hallOrigin, loadSession, loginSession, logoutSession } from "../src/session.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
// @verifies-requirement HALL-FR-WSP-470
it("stores only a private per-origin session and erases it even when revocation cannot be confirmed", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "hall-session-test-"));
  vi.stubEnv("XDG_CONFIG_HOME", temporary);
  const password = "test-password-never-stored";
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) =>
      String(url).endsWith("/login")
        ? new Response("{}", { headers: { "set-cookie": "hall_session=test-token; Max-Age=43200; HttpOnly" } })
        : new Response(JSON.stringify({ properties: { displayName: "Test", roles: ["contributor"] } })),
    );
  try {
    expect(await loginSession("https://hall.example", "test@example.test", password)).toMatchObject({
      displayName: "Test",
    });
    const directory = join(temporary, "hall/mcp");
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    const file = join(directory, files[0]);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).not.toContain(password);
    expect(await loadSession("https://other.example")).toBeUndefined();
    fetch.mockRejectedValue(new Error("offline"));
    expect(await logoutSession("https://hall.example")).toMatchObject({
      localSessionRemoved: true,
      serverSessionRevoked: false,
    });
    expect(await readdir(directory)).toEqual([]);
    expect(() => hallOrigin("http://external.example")).toThrow("HTTPS");
    expect(() => hallOrigin("https://hall.example/api")).toThrow("origin");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
