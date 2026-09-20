import { defineConfig, devices } from "@playwright/test";

const clientPort = Number.parseInt(process.env.HALL_E2E_CLIENT_PORT ?? "5175", 10);
const serverPort = Number.parseInt(process.env.HALL_E2E_SERVER_PORT ?? "3110", 10);
const clientUrl = `http://127.0.0.1:${clientPort}`;
const serverUrl = `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: process.env.HALL_E2E_OUTPUT_DIR ?? "./test-results/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
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
          // Verify the initial seed, then reset and reseed the same database before each browser scenario.
          { name: "seed", testMatch: /seed\.setup\.ts/ },
          {
            name: "chromium",
            testMatch: /\.spec\.ts/,
            testIgnore: /user-account\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
            dependencies: ["seed"],
          },
        ],
  webServer: [
    {
      command: "npm run e2e:server",
      cwd: "../..",
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
      cwd: ".",
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
