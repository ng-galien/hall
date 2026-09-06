/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  mutate: [
    "src/state-machines/meetingMachine.ts",
    "src/state-machines/agendaItemMachine.ts",
    "src/state-machines/councilDecisionMachine.ts",
  ],
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
