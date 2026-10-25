import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const client = resolve(root, "packages/client");
const specs = readdirSync(resolve(client, "e2e/specs")).filter((name) => name.endsWith(".spec.ts"));
const require = createRequire(import.meta.url);
const playwright = require.resolve("@playwright/test/cli");

function listedSpecs(authMode) {
  const result = spawnSync(process.execPath, [playwright, "test", "--config", "e2e/playwright.config.ts", "--list"], {
    cwd: client,
    env: { ...process.env, HALL_E2E_AUTH_MODE: String(authMode) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

const authenticationSpecs = new Set(["user-account.spec.ts", "personal-workspaces.spec.ts"]);
const regular = listedSpecs(false);
const authentication = listedSpecs(true);
for (const spec of specs) {
  const expected = authenticationSpecs.has(spec) ? authentication : regular;
  const other = authenticationSpecs.has(spec) ? regular : authentication;
  assert.ok(expected.includes(spec), `${spec} is missing from its Playwright suite`);
  assert.ok(!other.includes(spec), `${spec} is present in both Playwright suites`);
}
console.log(`Playwright inventory OK: ${specs.length} specifications in the regular and authentication suites`);
