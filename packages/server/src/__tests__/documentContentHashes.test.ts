import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { startLocalHttpServer } from "../core/localServer.js";

it("finds document copies by content, independently of names, without exposing them anonymously", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hall-document-hashes-"));
  const server = await startLocalHttpServer({ dataDirectory: directory });
  try {
    const bootstrap = await fetch(`${server.url}/api/auth/bootstrap`, {
      method: "POST",
      headers: { origin: server.url, "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@hash.test", displayName: "Admin", password: "Hash-test-password-2026!" }),
    });
    expect(bootstrap.status).toBe(201);
    const cookie = bootstrap.headers.get("set-cookie")!.split(";", 1)[0];
    const upload = async (name: string, path: string, content: string) => {
      const form = new FormData();
      form.set("file", new Blob([content], { type: "text/plain" }), name);
      form.set("path", path);
      const response = await fetch(`${server.url}/api/resources/documents`, {
        method: "POST",
        headers: { origin: server.url, cookie },
        body: form,
      });
      const value = await response.json();
      expect(response.status, JSON.stringify(value)).toBe(201);
      return value.properties.id as string;
    };
    const a = await upload("same.txt", "seed/one", "first content");
    const b = await upload("renamed.txt", "seed/two", "first content");
    const c = await upload("same.txt", "seed/three", "different content");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const url = `${server.url}/api/resources/documents/by-hashes?sha256=${hash("first content")}`;
    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, { headers: { cookie } });
    expect(response.status).toBe(200);
    const value = await response.json();
    const matches = value.entities.map((entry: { properties: { id: string } }) => entry.properties.id);
    expect(matches.sort()).toEqual([a, b].sort());
    expect(matches).not.toContain(c);
    for (const entry of value.entities) {
      expect(entry.properties.binary.contentSha256).toBe(hash("first content"));
      expect(entry.links.some((link: { rel: string[] }) => link.rel.includes("self"))).toBe(true);
    }
    const missing = await fetch(`${server.url}/api/resources/documents/by-hashes?sha256=${hash("absent")}`, {
      headers: { cookie },
    });
    expect(missing.status).toBe(200);
    expect((await missing.json()).entities ?? []).toHaveLength(0);
    expect(
      (await fetch(`${server.url}/api/resources/documents/by-hashes?sha256=invalid`, { headers: { cookie } })).status,
    ).toBe(400);
    const listing = await fetch(`${server.url}/api/resources/catalog`, { headers: { cookie } });
    expect(
      (await listing.json()).entities.filter(
        (entry: { properties: { kind: string } }) => entry.properties.kind === "document",
      ),
    ).toHaveLength(3);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
