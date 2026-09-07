import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const clientDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

// Contact mandates change the roster, and meeting journeys consume the next meeting.
// Run each family on a fresh database; editor/workspace scenarios remain together
// to expose unintended coupling within their own family.
const groups = [
  ["navigation", ["navigation-and-settings.spec.ts"]],
  ["contacts", ["contacts.spec.ts"]],
  ["editor", ["markdown-editor.spec.ts"]],
  ["workspace", ["workspace-explorer.spec.ts"]],
  [
    "public-secret-minutes",
    ["--grep", "conducts public and secret ballots and provisions the previous minutes approval$"],
  ],
  [
    "without-quorum",
    ["--grep", "conducts a meeting without quorum, adjourns voting items and closes without a ballot$"],
  ],
];

const results = [];
for (const [name, args] of groups) {
  const result = spawnSync(process.execPath, [join(clientDirectory, "scripts/run-e2e.mjs"), ...args, "--workers=1"], {
    cwd: clientDirectory,
    env: {
      ...process.env,
      HALL_E2E_OUTPUT_DIR: `./test-results/desktop/${name}`,
      PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/desktop/${name}`,
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  results.push({ name, passed: result.status === 0 });
}

for (const { name, passed } of results) console.log(`${passed ? "PASS" : "FAIL"} desktop/${name}`);
process.exitCode = results.every(({ passed }) => passed) ? 0 : 1;
