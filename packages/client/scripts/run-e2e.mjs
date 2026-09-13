import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const clientDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const projectDirectory = join(clientDirectory, "..", "..");
if (process.argv.length === 2) {
  const result = spawnSync(process.execPath, [join(clientDirectory, "scripts/run-desktop-e2e.mjs")], {
    cwd: clientDirectory,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const playwrightCli = require.resolve("@playwright/test/cli");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "hall-playwright-"));
const testDatabaseUrl = "postgresql://hall_test:hall-test-only@127.0.0.1:54330/hall_test";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectDirectory, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an E2E port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(String(address.port))));
    });
  });
}

const serverPort = process.env.HALL_E2E_SERVER_PORT ?? (await availablePort());
const clientPort = process.env.HALL_E2E_CLIENT_PORT ?? (await availablePort());

try {
  run("docker", ["compose", "--profile", "test", "rm", "--stop", "--force", "postgres-test"]);
  run("docker", ["compose", "--profile", "test", "up", "-d", "--wait", "postgres-test"]);

  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", "--config", "playwright.config.ts", ...process.argv.slice(2)],
    {
      cwd: clientDirectory,
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        DOCUMENT_STORAGE_PATH: join(temporaryDirectory, "documents"),
        HALL_DEV_AUTO_LOGIN: process.env.HALL_E2E_AUTH_MODE === "true" ? "false" : "true",
        HALL_E2E_CLIENT_PORT: clientPort,
        HALL_E2E_SERVER_PORT: serverPort,
      },
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  run("docker", ["compose", "--profile", "test", "rm", "--stop", "--force", "postgres-test"]);
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
