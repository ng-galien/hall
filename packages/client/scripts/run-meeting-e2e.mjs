import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const clientDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const scenarios = [
  ["public-secret-minutes", "conducts public and secret ballots and provisions the previous minutes approval"],
  ["without-quorum", "conducts a meeting without quorum, adjourns voting items and closes without a ballot"],
];

// Each lifecycle consumes the provisioned meeting. Reuse the ephemeral runner
// separately so neither scenario depends on the meeting left by the other.
// Separate artifact directories preserve both traces and reports.
const results = [];
for (const [name, title] of scenarios) {
  const result = spawnSync(
    process.execPath,
    [join(clientDirectory, "scripts/run-e2e.mjs"), "--grep", `^.*${title}$`, "--workers=1"],
    {
      cwd: clientDirectory,
      env: {
        ...process.env,
        HALL_E2E_OUTPUT_DIR: `./test-results/meetings/${name}`,
        PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/meetings/${name}`,
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  results.push({ name, passed: result.status === 0 });
}

for (const { name, passed } of results) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
process.exitCode = results.every(({ passed }) => passed) ? 0 : 1;
