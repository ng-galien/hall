import { defineConfig, devices } from "@playwright/test";

const port = 4793;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    locale: "fr-FR",
    launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] },
  },
  projects: [
    { name: "bureau-1280x800", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "bureau-1920x1080", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
    { name: "fenetre-720x480", use: { ...devices["Desktop Chrome"], viewport: { width: 720, height: 480 } } },
  ],
  webServer: {
    command: "npm run preview",
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
