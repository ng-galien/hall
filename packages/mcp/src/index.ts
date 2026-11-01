#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWorkspaceMcp, WorkspaceClient } from "./server.js";
import { hallOrigin, loadSession, loginSession, logoutSession, sessionStatus } from "./session.js";

async function privatePassword(): Promise<string> {
  process.stdout.write("Password (hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", read);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
      value = "";
    };
    const read = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0003" || character === "\u0004") {
          finish(new Error("Hall login cancelled."));
          return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    process.stdin.on("data", read);
    process.stdin.resume();
  });
}

// @implements-requirement HALL-FR-WSP-470
async function main() {
  const args = process.argv.slice(2);
  const origin = hallOrigin(process.env.HALL_URL ?? "http://127.0.0.1:3100");
  if (!args.length) {
    const token = process.env.HALL_SESSION_TOKEN ?? (await loadSession(origin))?.token;
    await createWorkspaceMcp(new WorkspaceClient(origin, token)).connect(new StdioServerTransport());
    return;
  }
  const [command, flag, url] = args;
  if (command === "--help") {
    console.log(
      "Hall MCP stdio server. Session commands: hall-workspace-mcp login|status|logout [--url <origin>]. Login requires a private interactive terminal. Configure only HALL_URL in the MCP client. Session storage currently supports POSIX; Windows login is unavailable.",
    );
    return;
  }
  if (
    !["login", "status", "logout"].includes(command) ||
    (args.length !== 1 && (args.length !== 3 || flag !== "--url"))
  )
    throw new Error("Use hall-workspace-mcp login|status|logout [--url <origin>], or --help.");
  const selectedOrigin = url ? hallOrigin(url) : origin;
  if (command === "login") {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      throw new Error(
        "Hall login requires a private interactive terminal; passwords are never accepted as command arguments or MCP prompts.",
      );
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const email = (await prompt.question("Email: ")).trim();
    prompt.close();
    const identity = await loginSession(selectedOrigin, email, await privatePassword());
    console.log(JSON.stringify(identity));
  } else if (command === "status") console.log(JSON.stringify(await sessionStatus(selectedOrigin)));
  else console.log(JSON.stringify(await logoutSession(selectedOrigin)));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Hall MCP failed.");
  process.exitCode = 1;
});
