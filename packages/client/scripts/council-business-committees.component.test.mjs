import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// @verifies-requirement HALL-FR-BUS-070
test("a read-only business keeps linked committees navigable without mutation controls", async () => {
  const temporary = mkdtempSync(join(clientRoot, "scripts", ".tmp-committee-component-"));
  const entry = join(temporary, "entry.tsx");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { CouncilBusinessCommittees } from ${JSON.stringify(join(clientRoot, "src/features/council-business/CouncilBusinessCommittees.tsx"))};\n` +
      `export { I18nProvider } from ${JSON.stringify(join(clientRoot, "src/i18n/I18nProvider.tsx"))};\n`,
  );
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/" });
  const originals = Object.fromEntries(
    ["window", "document", "navigator", "localStorage", "fetch", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.localStorage.setItem("mairie.locale", "en");
  const businessId = "business-read-only";
  const committeeId = "00000000-0000-4000-8000-000000000001";
  const siren = (payload) =>
    new Response(JSON.stringify(payload), { headers: { "content-type": "application/vnd.siren+json" } });
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (url === `/api/council-business/${businessId}`) {
      return siren({ properties: { id: businessId }, actions: [], links: [{ rel: ["self"], href: url }] });
    }
    if (url === `/api/council-business/${businessId}/committees`) {
      return siren({
        properties: {
          items: [
            {
              committeeId,
              name: "Commission Écoles",
              archivedAt: null,
              href: `/api/council-committees/${committeeId}`,
            },
          ],
        },
        links: [{ rel: ["self"], href: url }],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  let root;
  try {
    await build({
      entryPoints: [entry],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      alias: { "@": join(clientRoot, "src") },
      loader: { ".css": "empty" },
      logLevel: "silent",
    });
    const { CouncilBusinessCommittees, I18nProvider } = await import(pathToFileURL(output).href);
    root = createRoot(dom.window.document.getElementById("root"));
    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(MemoryRouter, null, createElement(CouncilBusinessCommittees, { businessId })),
        ),
      );
    });
    const badge = dom.window.document.querySelector('[data-testid="business-committee-badge"]');
    assert.match(badge?.textContent ?? "", /Commission Écoles/, `${dom.window.document.body.innerHTML}\n${requests}`);
    assert.equal(
      badge?.querySelector('[data-testid="business-committee-link"]')?.getAttribute("href"),
      `/council-committees/${committeeId}`,
    );
    assert.equal(dom.window.document.querySelector('[data-testid="business-committee-search-input"]'), null);
    assert.equal(dom.window.document.querySelector('[data-testid="business-committee-remove"]'), null);
  } finally {
    if (root) await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});
