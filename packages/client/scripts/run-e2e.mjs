import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const clientDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const playwrightCli = require.resolve("@playwright/test/cli");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "mairie-playwright-"));
const apiToken = "mairie-e2e-valid-token";

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

const serverPort = process.env.MAIRIE_E2E_SERVER_PORT ?? (await availablePort());
const clientPort = process.env.MAIRIE_E2E_CLIENT_PORT ?? (await availablePort());

try {
  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", "--config", "playwright.config.ts", ...process.argv.slice(2)],
    {
      cwd: clientDirectory,
      env: {
        ...process.env,
        DATABASE_PATH: join(temporaryDirectory, "mairie-e2e.sqlite"),
        DOCUMENT_STORAGE_PATH: join(temporaryDirectory, "documents"),
        MAIRIE_API_TOKEN: apiToken,
        MAIRIE_E2E_API_TOKEN: apiToken,
        MAIRIE_E2E_CLIENT_PORT: clientPort,
        MAIRIE_E2E_SERVER_PORT: serverPort,
      },
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
