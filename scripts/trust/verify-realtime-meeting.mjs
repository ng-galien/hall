import { spawnSync } from "node:child_process";

if (process.argv[2] !== "HALL-FR-MTG-320") throw new Error("Unexpected meeting requirement");

const commands = [
  ["npm", ["run", "build", "-w", "@hall/api-contract"]],
  ["npm", ["run", "typecheck", "-w", "@hall/server"]],
  [
    "npm",
    ["run", "test:vitest", "-w", "@hall/server", "--", "src/realtime/liveWebSocket.test.ts", "src/realtime/meetingPublication.test.ts"],
  ],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 180_000, maxBuffer: 5_000_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
}
console.log("scope:meeting");
console.log("contractBuild:passed");
console.log("serverTypecheck:passed");
console.log("focusedTests:passed");
