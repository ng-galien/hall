import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/api/apiCommandPolicy.test.ts",
      "src/__tests__/authorizationMatrix.test.ts",
      "src/__tests__/authorizationProperties.test.ts",
      "src/__tests__/securityHypermedia.test.ts",
    ],
    environment: "node",
    fileParallelism: false,
  },
});
