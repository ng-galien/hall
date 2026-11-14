import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sourceKey } from "./build.mjs";

const root = resolve(import.meta.dirname, "../..");
const records = [];
const started = Date.now();
const source = sourceKey();
const children = new Set();
async function run(name, command, env = {}) {
  const start = Date.now();
  console.log(`[gate] ${name} started`);
  const child = spawn(command, {
    detached: process.platform !== "win32",
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.add(child);
  const status = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", accept);
  });
  children.delete(child);
  const record = { name, seconds: (Date.now() - start) / 1000, status };
  records.push(record);
  console.log(`[gate] ${JSON.stringify(record)}`);
  if (status !== 0) throw new Error(`${name} failed (${status})`);
}
function stopChildren(signal = "SIGTERM") {
  for (const child of children) {
    if (process.platform === "win32") child.kill(signal);
    else
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
  }
}
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    interrupted = true;
    stopChildren(signal);
  });
async function together(tasks) {
  try {
    await Promise.all(tasks);
  } catch (error) {
    stopChildren();
    await Promise.allSettled(tasks);
    throw error;
  }
}
async function browserWithBackend(backend) {
  const temporary = mkdtempSync(resolve(tmpdir(), "hall-gate-ready-"));
  const signal = resolve(temporary, "schema-ready");
  let finished = false;
  const browser = run("browser", groups.browser, {
    HALL_E2E_MOBILE_RECUSALS: "1",
    HALL_E2E_DESKTOP: "false",
    HALL_E2E_PREPARED_SIGNAL: signal,
  }).finally(() => {
    finished = true;
  });
  browser.catch(() => undefined);
  try {
    while (!existsSync(signal)) {
      if (finished) return await browser;
      await delay(50);
    }
    await together([browser, backend()]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const mode = process.argv[2] ?? "all";
const groups = {
  checks: [
    "npm run check:test-inventory",
    "npm run check:public-artifacts",
    "npm run check:requirements",
    "npm run test:meta",
    "code-moniker check .",
    "npm run lint",
    "npm run typecheck:built",
  ],
  fixtures: "npx vitest run tests/postgres/e2e-fixture.test.mjs",
  backend: "npm run test:backend",
  units:
    "npm run test --workspace @hall/api-contract --workspace @hall/mcp --workspace @hall/templating --workspace @hall/client --workspace @hall/desktop -- --maxWorkers=2 && npm run test:i18n-hmr",
  mutation: "npm run test:policy:mutation",
  postgres:
    "node tests/postgres/run.mjs --pgtap all && npx vitest run --config tests/postgres/vitest.adapter.config.ts",
  browser: "node packages/client/e2e/run.mjs --all",
  distribution: "npm run pack:distribution -- --prebuilt && npm run test:distribution:complete",
};
/* Every command of a list group runs; the group fails after the last one if any failed, and names each failure. */
async function runGroup(name) {
  const commands = groups[name];
  if (typeof commands === "string") return run(name, commands);
  const start = Date.now();
  const failures = [];
  for (const command of commands) {
    if (interrupted) throw new Error(`${name} interrupted`);
    await run(`${name}: ${command}`, command).catch((error) => {
      failures.push(command);
      console.error(`[gate] ${error.message}`);
    });
  }
  const status = failures.length === 0 ? 0 : 1;
  const record = { name, seconds: (Date.now() - start) / 1000, status, failures };
  records.push(record);
  console.log(`[gate] ${JSON.stringify(record)}`);
  if (status !== 0) throw new Error(`${name} failed: ${failures.join("; ")}`);
}
async function unitChecks() {
  await run("units", groups.units);
  await run("mutation", groups.mutation);
}
try {
  if (mode === "all") {
    await run("build", "npm run build:verified");
    await runGroup("checks");
    await run("fixtures", groups.fixtures);
    await browserWithBackend(async () => {
      await run("backend", groups.backend);
      await together([
        unitChecks(),
        (async () => {
          await run("postgres", groups.postgres);
          await run("distribution", groups.distribution);
        })(),
      ]);
    });
  } else if (mode === "verification") {
    await runGroup("checks");
    await run("fixtures", groups.fixtures);
    await run("backend", groups.backend);
    await together([unitChecks(), run("postgres", groups.postgres)]);
  } else {
    if (!Object.hasOwn(groups, mode)) throw new Error(`Unknown gate group: ${mode}`);
    await runGroup(mode);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  const unchanged = source === sourceKey();
  if (!unchanged) process.exitCode = 1;
  mkdirSync(resolve(root, "dist/verification"), { recursive: true });
  writeFileSync(
    resolve(root, `dist/verification/${mode}.json`),
    JSON.stringify(
      {
        source,
        unchanged,
        seconds: (Date.now() - started) / 1000,
        withinFifteenMinutes: Date.now() - started <= 900_000,
        targetMet: process.exitCode !== 1 && Date.now() - started <= 900_000,
        passed: process.exitCode !== 1,
        records,
      },
      null,
      2,
    ),
  );
}
