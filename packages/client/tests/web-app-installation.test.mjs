import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

import { cacheName, frenchText, renderManifest, renderOfflinePage, renderServiceWorker } from "../web-app.mjs";

const identity = { version: "0.1.0", commit: "abc123" };
const scope = "https://hall.example.test/app/";

function startServiceWorker(existingCaches = []) {
  const listeners = {};
  const stores = new Map(existingCaches.map((name) => [name, new Map()]));
  const network = [];
  const caches = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        add: async (request) => {
          network.push(request.url);
          store.set(request.url, { body: `cached ${request.url}` });
        },
        match: async (url) => store.get(url),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const self = {
    registration: { scope },
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  let online = true;
  const fetch = async (request) => {
    if (!online) throw new TypeError("offline");
    network.push(request.url);
    return { body: `network ${request.url}` };
  };
  class Request {
    constructor(url, init = {}) {
      this.url = url;
      this.mode = init.mode ?? "cors";
      this.method = init.method ?? "GET";
    }
  }
  runInNewContext(renderServiceWorker(identity), {
    self,
    caches,
    fetch,
    Request,
    URL,
    Promise,
    Response: { error: () => null },
  });
  const lifecycle = async (type) => {
    let pending;
    listeners[type]({ waitUntil: (promise) => (pending = promise) });
    await pending;
  };
  const request = (path, init) => {
    let answer;
    listeners.fetch({
      request: new Request(new URL(path, scope).href, init),
      respondWith: (response) => (answer = response),
    });
    return answer;
  };
  return { stores, network, lifecycle, request, goOffline: () => (online = false) };
}

test("the manifest takes its names from the translation keys and installs Hall under /app/", () => {
  const manifest = renderManifest("/app/");
  assert.equal(manifest.name, frenchText("app.windowTitle"));
  assert.equal(manifest.short_name, frenchText("app.shortName"));
  assert.equal(manifest.start_url, "/app/");
  assert.equal(manifest.scope, "/app/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map((icon) => [icon.sizes, icon.purpose]),
    [
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ],
  );
});

test("the offline page is titled by the application name and carries its icon inline", () => {
  const page = renderOfflinePage();
  assert.match(page, new RegExp(`<title>${frenchText("app.windowTitle")}</title>`));
  assert.match(page, /<svg aria-hidden="true"/);
  assert.doesNotMatch(page, /__[A-Z_]+__/);
});

test("the cache name changes with the build commit", () => {
  assert.notEqual(cacheName(identity), cacheName({ ...identity, commit: "def456" }));
});

test("the service worker answers only screen openings under /app/", async () => {
  const worker = startServiceWorker();
  expect(worker.request("meetings/12", { mode: "navigate" })).toBeDefined();
  expect(worker.request("", { mode: "navigate" })).toBeDefined();
  for (const [path, init] of [
    ["/api/council-meetings", {}],
    ["/api/minutes/4/pdf", { mode: "navigate" }],
    ["/api/documentary-resources", { method: "POST" }],
    ["/api/live", {}],
    ["/mcp", { method: "POST" }],
    ["assets/index.js", { mode: "no-cors" }],
    ["icons/icon-192.png", {}],
  ]) {
    assert.equal(worker.request(path, init), undefined, `${path} must not be intercepted`);
  }
});

test("only the offline page is stored, it is served when the network fails, and older caches are removed", async () => {
  const worker = startServiceWorker(["hall-offline-0.1.0-old"]);
  await worker.lifecycle("install");
  await worker.lifecycle("activate");
  assert.deepEqual([...worker.stores.keys()], [cacheName(identity)]);
  assert.deepEqual([...worker.stores.get(cacheName(identity)).keys()], [`${scope}offline.html`]);

  assert.deepEqual(await worker.request("meetings/12", { mode: "navigate" }), { body: `network ${scope}meetings/12` });
  assert.deepEqual([...worker.stores.get(cacheName(identity)).keys()], [`${scope}offline.html`]);

  worker.goOffline();
  assert.deepEqual(await worker.request("meetings/12", { mode: "navigate" }), { body: `cached ${scope}offline.html` });
});
