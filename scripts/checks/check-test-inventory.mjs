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

function listedSpecs(authMode, documentationJourneys = false, meetingRules = false) {
  const result = spawnSync(process.execPath, [playwright, "test", "--config", "e2e/playwright.config.ts", "--list"], {
    cwd: client,
    env: {
      ...process.env,
      HALL_E2E_AUTH_MODE: String(authMode),
      HALL_DOCS_CAPTURES: "false",
      HALL_DOCS_JOURNEYS: String(documentationJourneys),
      HALL_E2E_MEETING_RULES: String(meetingRules),
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

const authenticationSpecs = new Set([
  "user-account.spec.ts",
  "user-passphrase.spec.ts",
  "personal-workspaces.spec.ts",
  "authorization-roles.spec.ts",
]);
const regular = listedSpecs(false);
const authentication = listedSpecs(true);
for (const spec of specs) {
  const expected = authenticationSpecs.has(spec) ? authentication : regular;
  const other = authenticationSpecs.has(spec) ? regular : authentication;
  assert.ok(expected.includes(spec), `${spec} is missing from its Playwright suite`);
  assert.ok(!other.includes(spec), `${spec} is present in both Playwright suites`);
}
const journeys = readdirSync(resolve(client, "e2e/captures")).filter((name) => name.endsWith(".captures.ts"));
const documentation = listedSpecs(false, true);
for (const journey of journeys) {
  assert.ok(
    documentation.includes(`[docs-journeys]`) && documentation.includes(journey),
    `${journey} is missing from the docs-journeys project`,
  );
  assert.ok(!regular.includes(journey) && !authentication.includes(journey), `${journey} is present in another suite`);
}
const ruleSpecs = readdirSync(resolve(client, "e2e/meeting-rules")).filter((name) => name.endsWith(".spec.ts"));
const rules = listedSpecs(false, false, true);
for (const spec of ruleSpecs) {
  assert.ok(
    rules.includes("[meeting-rules]") && rules.includes(spec),
    `${spec} is missing from the meeting-rules project`,
  );
  assert.ok(
    !regular.includes(spec) && !authentication.includes(spec) && !documentation.includes(spec),
    `${spec} is present in another suite`,
  );
}
console.log(
  `Playwright inventory OK: ${specs.length} specifications in the regular and authentication suites, ${journeys.length} documentation journeys in docs-journeys, ${ruleSpecs.length} meeting-rule journeys in meeting-rules`,
);
