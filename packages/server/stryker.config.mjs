/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  mutate: [
    "src/api/apiCommandAuthorization.ts",
    "src/api/apiCommandResolution.ts",
    "src/security/authorization.ts",
  ],
  testRunner: "vitest",
  coverageAnalysis: "perTest",
  vitest: {
    configFile: "vitest.policy.config.ts",
    dir: ".",
    related: true,
  },
  reporters: ["clear-text", "progress"],
  thresholds: {
    high: 95,
    low: 90,
    break: 90,
  },
  concurrency: 4,
  timeoutMS: 20_000,
};
