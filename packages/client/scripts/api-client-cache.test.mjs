import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("confirmed deletion releases resource aliases and preserves unrelated cached resources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hall-cache-test-"));
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  try {
    const output = join(directory, "api-client.mjs");
    await build({
      entryPoints: [join(import.meta.dirname, "../src/services/apiClient.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: output,
    });
    const { apiSirenRequest, sirenRepresentation } = await import(pathToFileURL(output).href);
    const calls = [];
    let deletionAllowed = false;
    globalThis.window = {
      location: { origin: "http://audit.invalid" },
      dispatchEvent() {
        return true;
      },
    };
    globalThis.fetch = async (url, init) => {
      calls.push(url);
      if (init.method === "DELETE") {
        return deletionAllowed
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ code: "permission_denied" }), { status: 403 });
      }
      const id = url.endsWith("other") ? "other" : "one";
      return new Response(
        JSON.stringify({
          class: ["resource"],
          properties: { id, content: "retained document" },
          links: [{ rel: ["self"], href: `/api/resources/${id}` }],
        }),
        { headers: { "content-type": "application/vnd.siren+json" } },
      );
    };
    await apiSirenRequest("/resources/alias");
    // Reading the canonical path replaces its representation, while the alias retains the older object.
    await apiSirenRequest("/resources/one");
    const other = await sirenRepresentation("/resources/other");
    await assert.rejects(apiSirenRequest("/resources/one", { method: "DELETE" }));
    const beforeFailureRead = calls.length;
    await sirenRepresentation("/resources/alias");
    assert.equal(calls.length, beforeFailureRead, "failed deletion preserves the alias");
    deletionAllowed = true;
    await apiSirenRequest("/resources/one", { method: "DELETE" });
    const beforeOther = calls.length;
    assert.equal(await sirenRepresentation("/resources/other"), other);
    assert.equal(calls.length, beforeOther, "unrelated cache entry remains available");
    await sirenRepresentation("/resources/alias");
    assert.equal(calls.length, beforeOther + 1, "deleted alias must be fetched rather than retained");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    await rm(directory, { recursive: true, force: true });
  }
});
