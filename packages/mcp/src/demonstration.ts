import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { HallAction } from "./actions.js";
import { type Upload, WorkspaceClient } from "./client.js";
import { readPrivateJson, sessionDirectory, writePrivateJson } from "./session.js";

const loopbackHosts = ["127.0.0.1", "localhost", "[::1]"];
const closedMessage =
  "The Hall demonstration application is not running on this computer. Open Hall (demonstration edition), then retry; nothing else needs to be configured.";

const connectionSchema = z.object({
  edition: z.literal("demonstration"),
  origin: z.url(),
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type DemonstrationConnection = z.infer<typeof connectionSchema>;

function demonstrationFile() {
  const directory = sessionDirectory();
  return { directory, file: join(directory, "demonstration.json") };
}

function loopbackOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !loopbackHosts.includes(url.hostname) || url.origin !== value)
    throw new Error("The Hall demonstration connection must be an http origin on the loopback interface.");
  return url.origin;
}

/** Publishes the running demonstration's loopback origin and MCP session in the private MCP directory. */
// @implements-requirement HALL-FR-WSP-470
export async function publishDemonstrationConnection(connection: Omit<DemonstrationConnection, "edition">) {
  const { directory, file } = demonstrationFile();
  const value = connectionSchema.parse({ edition: "demonstration", ...connection });
  loopbackOrigin(value.origin);
  await writePrivateJson(directory, file, value);
}

/** Removes the published connection when it still designates this origin. */
export async function withdrawDemonstrationConnection(origin: string) {
  const current = await loadDemonstrationConnection().catch(() => undefined);
  if (current?.origin === origin) await rm(demonstrationFile().file, { force: true });
}

export async function loadDemonstrationConnection(): Promise<DemonstrationConnection | undefined> {
  if (process.platform === "win32")
    throw new Error("The Hall demonstration connection is not available on Windows (no private POSIX storage).");
  const { directory, file } = demonstrationFile();
  const content = await readPrivateJson(directory, file);
  if (content === undefined) return undefined;
  const value = connectionSchema.parse(content);
  loopbackOrigin(value.origin);
  return value;
}

function unreachable(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  return (
    error instanceof TypeError &&
    cause !== null &&
    typeof cause === "object" &&
    "code" in cause &&
    ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH"].includes(String(cause.code))
  );
}

/** Workspace client that follows the demonstration application: the connection is read again on every call. */
// @implements-requirement HALL-FR-WSP-470
export class DemonstrationWorkspaceClient {
  private async call<T>(operation: (client: WorkspaceClient) => Promise<T>): Promise<T> {
    const connection = await loadDemonstrationConnection();
    if (!connection) throw new Error(closedMessage);
    try {
      return await operation(new WorkspaceClient(connection.origin, connection.token));
    } catch (error) {
      if (unreachable(error)) throw new Error(closedMessage);
      if (error instanceof Error && error.message.startsWith("Hall HTTP 401"))
        throw new Error(
          "The Hall demonstration session was refused. Close and reopen the Hall demonstration application, then retry.",
        );
      throw error;
    }
  }

  read(href: string) {
    return this.call((client) => client.read(href));
  }

  execute(href: string, name: HallAction, input: Record<string, unknown>, file?: Upload) {
    return this.call((client) => client.execute(href, name, input, file));
  }

  binary(href: string, offset: number, length: number) {
    return this.call((client) => client.binary(href, offset, length));
  }
}
