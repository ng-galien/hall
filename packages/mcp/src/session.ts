import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { WorkspaceClient } from "./client.js";

const storedSessionSchema = z.object({ origin: z.url(), token: z.string().min(1), expiresAt: z.iso.datetime() });
const identitySchema = z.object({ properties: z.object({ displayName: z.string(), roles: z.array(z.string()) }) });

export function hallOrigin(value: string) {
  new WorkspaceClient(value);
  return new URL(value).origin;
}

export function sessionDirectory() {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "hall", "mcp");
}

function location(origin: string) {
  const directory = sessionDirectory();
  return { directory, file: join(directory, `${createHash("sha256").update(origin).digest("hex")}.json`) };
}

export async function checkPrivate(path: string, directory = false) {
  const entry = await lstat(path);
  if (process.platform === "win32")
    throw new Error("Private MCP session storage is not implemented on Windows. No session was stored.");
  if (
    entry.isSymbolicLink() ||
    (directory ? !entry.isDirectory() : !entry.isFile()) ||
    (entry.mode & 0o077) !== 0 ||
    entry.uid !== process.getuid?.()
  )
    throw new Error("Hall MCP session storage must be owned by this user and private (directory 700, file 600).");
}

// @implements-requirement HALL-FR-WSP-470
export async function loadSession(origin: string) {
  const { directory, file } = location(origin);
  const content = await readPrivateJson(directory, file);
  if (content === undefined) return undefined;
  const value = storedSessionSchema.parse(content);
  if (value.origin !== origin) throw new Error("Hall MCP session origin mismatch.");
  return value;
}

/** Reads a JSON file of the private session directory; undefined when it does not exist. */
export async function readPrivateJson(directory: string, file: string): Promise<unknown> {
  try {
    await checkPrivate(directory, true);
    await checkPrivate(file);
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      return JSON.parse(await handle.readFile("utf8"));
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** Atomically writes a file readable by this user only (file 600 in a directory 700). */
export async function writePrivateJson(directory: string, file: string, value: unknown) {
  if (process.platform === "win32")
    throw new Error("Private MCP session storage is not implemented on Windows. No session was stored.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await checkPrivate(directory, true);
  await chmod(directory, 0o700);
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`);
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function saveSession(value: z.infer<typeof storedSessionSchema>) {
  const { directory, file } = location(value.origin);
  await writePrivateJson(directory, file, storedSessionSchema.parse(value));
}

async function auth(origin: string, path: "login" | "session" | "logout", token?: string, body?: unknown) {
  const response = await fetch(`${origin}/api/auth/${path}`, {
    method: path === "session" ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      ...(token ? { Cookie: `hall_session=${encodeURIComponent(token)}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `Hall authentication HTTP ${response.status}. Check the instance/account or run hall-workspace-mcp login again. No session secret is displayed.`,
    );
  return response;
}

// @implements-requirement HALL-FR-WSP-470
export async function loginSession(origin: string, email: string, password: string) {
  if (process.platform === "win32")
    throw new Error("Private MCP session storage is not implemented on Windows. No session was stored.");
  const response = await auth(origin, "login", undefined, { email, password });
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("hall_session="));
  if (!cookie) throw new Error("Hall login did not return a session cookie.");
  const token = decodeURIComponent(cookie.split(";", 1)[0].slice("hall_session=".length));
  const maxAge = /;\s*Max-Age=(\d+)/i.exec(cookie)?.[1];
  if (!maxAge) throw new Error("Hall login did not return a session lifetime.");
  const expiresAt = new Date(Date.now() + Number(maxAge) * 1000).toISOString();
  try {
    await saveSession({ origin, token, expiresAt });
  } catch (error) {
    await auth(origin, "logout", token, {}).catch(() => undefined);
    throw error;
  }
  return sessionStatus(origin);
}

export async function sessionStatus(origin: string) {
  const session = await loadSession(origin);
  if (!session)
    throw new Error("No saved Hall MCP session for this origin. Run hall-workspace-mcp login --url <origin>.");
  const response = await auth(origin, "session", session.token);
  const identity = identitySchema.parse(await response.json()).properties;
  return { origin, ...identity, expiresAt: session.expiresAt };
}

// @implements-requirement HALL-FR-WSP-470
export async function logoutSession(origin: string) {
  let revoked = false;
  let warning: string | undefined;
  try {
    const session = await loadSession(origin);
    if (session) {
      await auth(origin, "logout", session.token, {});
      revoked = true;
    }
  } catch {
    warning =
      "Server revocation could not be confirmed; the server session may remain valid until expiry. Check connectivity and revoke account access in Hall if required.";
  }
  try {
    await rm(location(origin).file, { force: true });
  } catch {
    throw new Error("Unable to remove the local Hall MCP session. Check private storage permissions.");
  }
  return { origin, localSessionRemoved: true, serverSessionRevoked: revoked, ...(warning ? { warning } : {}) };
}
