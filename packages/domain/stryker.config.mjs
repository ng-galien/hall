/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  mutate: ["src/participationPolicy.ts", "src/state-machines/ballotMachine.ts"],
  testRunner: "vitest",
  coverageAnalysis: "perTest",
  vitest: {
    configFile: "vitest.config.ts",
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
