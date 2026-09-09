#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWorkspaceMcp, WorkspaceClient } from "./server.js";

await createWorkspaceMcp(
  new WorkspaceClient(process.env.HALL_URL ?? "http://127.0.0.1:3100", process.env.HALL_SESSION_TOKEN),
).connect(new StdioServerTransport());
