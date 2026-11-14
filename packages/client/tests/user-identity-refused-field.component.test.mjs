import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterAll, beforeAll, test } from "vitest";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const names = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
let temporary;
let originals;
let useUserIdentity;
let useUsersStore;

beforeAll(async () => {
  temporary = mkdtempSync(join(clientRoot, ".tmp-user-identity-"));
  const entry = join(temporary, "entry.ts");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { useUserIdentity } from ${JSON.stringify(join(clientRoot, "src/features/users/useUserIdentity.ts"))};\n` +
      `export { useUsersStore } from ${JSON.stringify(join(clientRoot, "src/stores/usersStore.ts"))};\n`,
  );
  await build({
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    alias: { "@": join(clientRoot, "src") },
    logLevel: "silent",
  });
  ({ useUserIdentity, useUsersStore } = await import(pathToFileURL(output).href));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/" });
  originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

afterAll(() => {
  for (const [key, descriptor] of Object.entries(originals ?? {})) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

const user = {
  id: "7c1d2e4f-0000-4000-8000-000000000001",
  displayName: "Secrétariat",
  email: "secretariat@example.test",
  contactId: null,
  roles: ["secretariat"],
  status: "active",
  passwordChangeRequired: false,
  accountMail: null,
  createdAt: "2026-11-13T08:00:00.000Z",
  updatedAt: "2026-11-13T08:00:00.000Z",
};

async function mountIdentity(refusedEmail = null) {
  const requests = [];
  useUsersStore.setState({
    error: null,
    update: async (id, input) => {
      requests.push({ id, input });
      if (input.email === refusedEmail) {
        useUsersStore.setState({ error: "user_email_conflict" });
        return null;
      }
      return { ...user, ...input };
    },
  });
  const view = { current: null };
  function Probe() {
    view.current = useUserIdentity(user, true);
    return null;
  }
  const router = createMemoryRouter([{ path: "/", element: createElement(Probe) }]);
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(createElement(RouterProvider, { router })));
  return { view, requests, unmount: () => act(async () => root.unmount()) };
}

test("a malformed email address is refused on its field and no save request leaves", async () => {
  const { view, requests, unmount } = await mountIdentity();
  await act(async () => view.current.change("email", "secretariat@"));
  let saved;
  await act(async () => {
    saved = await view.current.flush();
  });
  assert.equal(saved, false);
  assert.deepEqual(view.current.invalidFields, ["email"]);
  assert.equal(requests.length, 0);
  await act(async () => view.current.change("email", "accueil@example.test"));
  assert.deepEqual(view.current.invalidFields, []);
  await act(async () => {
    saved = await view.current.flush();
  });
  assert.equal(saved, true);
  assert.deepEqual(requests, [
    { id: user.id, input: { displayName: user.displayName, email: "accueil@example.test", contactId: null } },
  ]);
  await unmount();
});

// @verifies-requirement HALL-FR-USR-100
test("an address the server refuses because another account holds it is named on the address field", async () => {
  const { view, requests, unmount } = await mountIdentity("accueil@example.test");
  await act(async () => view.current.change("email", "accueil@example.test"));
  let saved;
  await act(async () => {
    saved = await view.current.flush();
  });
  assert.equal(saved, false);
  assert.equal(requests.length, 1);
  assert.equal(view.current.emailTaken, true);
  assert.deepEqual(view.current.invalidFields, []);
  assert.equal(view.current.saveState, "error");
  await act(async () => view.current.change("displayName", "Accueil"));
  assert.equal(view.current.emailTaken, true);
  await act(async () => view.current.change("email", "mairie@example.test"));
  assert.equal(view.current.emailTaken, false);
  await act(async () => {
    saved = await view.current.flush();
  });
  assert.equal(saved, true);
  await unmount();
});
