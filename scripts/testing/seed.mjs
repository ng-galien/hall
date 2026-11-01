// A seed must not outlive the fixture worker which owns its API server and database.
process.stdin.resume();
process.stdin.once("end", () => process.exit(1));
process.stdin.once("error", () => process.exit(1));
try {
  const { main } = await import("../seed/seed-dev.mjs");
  await main([], process.env);
} finally {
  process.stdin.destroy();
}
