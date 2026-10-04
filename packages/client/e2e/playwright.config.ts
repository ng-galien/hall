import { defineConfig, devices } from "@playwright/test";

const clientPort = Number.parseInt(process.env.HALL_E2E_CLIENT_PORT ?? "5175", 10);
const serverPort = Number.parseInt(process.env.HALL_E2E_SERVER_PORT ?? "3110", 10);
const clientUrl = `http://127.0.0.1:${clientPort}`;
const serverUrl = `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  testDir: "./specs",
  outputDir: process.env.HALL_E2E_OUTPUT_DIR ?? "../test-results/e2e",
  globalTimeout: (process.env.CI ? 60 : 10) * 60_000,
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `${clientUrl}/app/`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects:
    process.env.HALL_E2E_AUTH_MODE === "true"
      ? [{ name: "authentication", testMatch: /user-account\.spec\.ts/, use: { ...devices["Desktop Chrome"] } }]
      : [
          {
            name: "chromium",
            testMatch: /\.spec\.ts/,
            testIgnore: /user-account\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ],
  webServer: [
    {
      command: "node packages/server/dist/index.js",
      cwd: "../../..",
      env: {
        ...process.env,
        HALL_ALLOWED_ORIGINS: clientUrl,
        SERVER_HOST: "127.0.0.1",
        SERVER_PORT: String(serverPort),
      },
      url: `${serverUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${clientPort} --strictPort`,
      cwd: "..",
      env: {
        ...process.env,
        VITE_API_TARGET: serverUrl,
      },
      url: `${clientUrl}/app/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
