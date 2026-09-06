import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/model.ts"],
      thresholds: {
        statements: 92,
        branches: 87,
        functions: 82,
        lines: 92,
        "src/participationPolicy.ts": { 100: true },
        "src/state-machines/{meetingMachine,agendaItemMachine,councilDecisionMachine}.ts": { 100: true },
        "src/state-machines/ballotMachine.ts": {
          statements: 97,
          branches: 94,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
