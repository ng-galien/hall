import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Chromium's macOS Mach rendezvous cannot be started reliably from parallel Vitest workers.
    // The server suite is small and also exercises shared database/bootstrap process state.
    pool: "threads",
    fileParallelism: false,
  },
});
