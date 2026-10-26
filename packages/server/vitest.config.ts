import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    // Chromium's macOS Mach rendezvous cannot be started reliably from parallel Vitest workers.
    // The server suite is small and also exercises shared database/bootstrap process state.
    pool: "threads",
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/types/**",
        "src/index.ts",
        "src/server.ts",
        "src/core/config.ts",
        "src/core/logger.ts",
        "src/infrastructure/postgres/**",
      ],
      thresholds: {
        statements: 90,
        branches: 81,
        functions: 96,
        lines: 94,
        "src/domain/documentPolicy.ts": { statements: 100, functions: 100, lines: 100 },
        "src/services/hallSettingsService.ts": { 100: true },
        "src/services/meetingContentPolicy.ts": { 100: true },
      },
    },
  },
});
