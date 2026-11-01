import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it } from "vitest";
import { createDistributionDatabase } from "../../../../tests/distribution/database.mjs";

const root = resolve(import.meta.dirname, "../../../..");
function unpack(result) {
  const content = result.content.find((item) => item.type === "text");
  return JSON.parse(content.text);
}
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((accept) => server.close(accept));
  return port;
}

// @verifies-requirement HALL-FR-WSP-470
it("uses the installed MCP command and HTTP transport with real Hall sessions, refusals and permission changes", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "hall-installed-mcp-"));
  const prefix = join(temporary, "installation with spaces");
  const environment = {
    PATH: process.env.PATH,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        ["systemroot", "windir", "comspec", "pathext", "appdata", "localappdata", "userprofile"].includes(
          key.toLowerCase(),
        ),
      ),
    ),
    XDG_CONFIG_HOME: join(temporary, "profile"),
    npm_config_update_notifier: "false",
    npm_config_cache: process.env.npm_config_cache ?? join(tmpdir(), "hall-distribution-npm-cache"),
    PLAYWRIGHT_BROWSERS_PATH: join(tmpdir(), "hall-distribution-browser-cache"),
  };
  const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
  const installed = join(prefix, "node_modules/@ng-galien/hall");
  const cli = join(installed, "bin/hall.mjs");
  const mcp = join(installed, "bin/hall-workspace-mcp.mjs");
  const envFile = join(temporary, "hall.env");
  let database;
  let running;
  const clients = [];
  async function connect(session, http = false) {
    const client = new Client({ name: "installed-verification", version: "1" });
    const transport = http
      ? new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Cookie: session } } })
      : new StdioClientTransport({
          command: process.execPath,
          args: [mcp],
          cwd: temporary,
          env: {
            ...environment,
            HALL_URL: origin,
            ...(session ? { HALL_SESSION_TOKEN: decodeURIComponent(session.slice("hall_session=".length)) } : {}),
          },
          stderr: "pipe",
        });
    await client.connect(transport);
    clients.push(client);
    return client;
  }
  const origin = `http://127.0.0.1:${await freePort()}`;
  async function request(path, { body, cookie = "", method = body === undefined ? "GET" : "POST" } = {}) {
    return fetch(`${origin}${path}`, {
      method,
      headers: { Cookie: cookie, Origin: origin, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const user = { email: "mcp-admin@example.test", displayName: "MCP test administrator", password: randomUUID() };
  const reader = { email: "mcp-reader@example.test", displayName: "MCP test reader", password: randomUUID() };
  try {
    const installation = spawnSync(
      process.execPath,
      [
        process.env.npm_execpath,
        "install",
        "--ignore-scripts",
        "--prefix",
        prefix,
        "--no-audit",
        "--no-fund",
        process.env.HALL_PACKAGE_TEST_ARCHIVE ?? join(root, `dist/npm/ng-galien-hall-${version}.tgz`),
      ],
      { cwd: temporary, env: environment, encoding: "utf8", timeout: 300_000 },
    );
    expect(installation.status, installation.stderr).toBe(0);
    const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
    expect(manifest.bin["hall-workspace-mcp"]).toBe("bin/hall-workspace-mcp.mjs");
    const browser = spawnSync(process.execPath, [cli, "install-browser"], {
      cwd: temporary,
      env: environment,
      encoding: "utf8",
      timeout: 300_000,
    });
    expect(browser.status, browser.stderr).toBe(0);
    const anonymous = await connect("");
    expect((await anonymous.listTools()).tools.map((tool) => tool.name)).toContain("hall_learn");
    expect(unpack(await anonymous.callTool({ name: "hall_learn", arguments: {} })).topic).toBe("overview");
    expect(unpack(await anonymous.callTool({ name: "hall_learn", arguments: { topic: "missing" } })).unknownTopic).toBe(
      "missing",
    );
    database = await createDistributionDatabase(join(temporary, "database"));
    await writeFile(
      envFile,
      `NODE_ENV=production\nDATABASE_URL=${database.url}\nSERVER_HOST=127.0.0.1\nSERVER_PORT=${new URL(origin).port}\nHALL_ALLOWED_ORIGINS=${origin}\n`,
      { mode: 0o600 },
    );
    const migration = spawnSync(process.execPath, [cli, "migrate", "--env-file", envFile], {
      cwd: temporary,
      env: environment,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(migration.status, migration.stderr).toBe(0);
    running = spawn(process.execPath, [cli, "start", "--env-file", envFile], {
      cwd: temporary,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    running.stdout.on("data", (chunk) => {
      output += chunk;
    });
    running.stderr.on("data", (chunk) => {
      output += chunk;
    });
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (running.exitCode !== null || running.signalCode !== null)
        throw new Error(`Installed server exited before readiness: ${output}`);
      try {
        ready = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) })).ok;
      } catch {
        /* Wait for the isolated server. */
      }
      if (ready) break;
      await delay(100);
    }
    expect(ready, output).toBe(true);
    expect((await request("/mcp", { body: {} })).status).toBe(401);
    expect((await request("/mcp", { body: {}, cookie: "hall_session=invalid" })).status).toBe(401);
    const bootstrap = await request("/api/auth/bootstrap", { body: user });
    expect(bootstrap.status).toBe(201);
    let cookie = bootstrap.headers.get("set-cookie").split(";", 1)[0];
    const identity = await request("/api/auth/session", { cookie });
    expect((await identity.json()).properties.displayName).toBe(user.displayName);
    const privateDirectory = join(environment.XDG_CONFIG_HOME, "hall/mcp");
    let authenticated;
    if (process.platform === "win32") {
      const unsupported = spawnSync(process.execPath, [mcp, "login", "--url", origin], {
        cwd: temporary,
        env: environment,
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(unsupported.status).not.toBe(0);
      expect(unsupported.stderr).toContain("Private MCP session storage is not implemented on Windows");
      await expect(stat(privateDirectory)).rejects.toMatchObject({ code: "ENOENT" });
      authenticated = await connect(cookie);
    } else {
      const terminalLogin = spawnSync(
        "python3",
        [
          "-c",
          `
import errno, json, os, pty, select, sys, time
credentials = json.load(sys.stdin)
pid, fd = pty.fork()
if pid == 0:
    os.execve(sys.argv[1], [sys.argv[1], sys.argv[2], "login", "--url", sys.argv[3]], os.environ)
output = b""
stage = 0
deadline = time.time() + 30
while time.time() < deadline:
    ready, _, _ = select.select([fd], [], [], 0.1)
    if ready:
        try:
            chunk = os.read(fd, 65536)
        except OSError as error:
            if error.errno == errno.EIO: break
            raise
        if not chunk: break
        output += chunk
        if stage == 0 and b"Email: " in output:
            os.write(fd, (credentials["email"] + "\\n").encode()); stage = 1
        if stage == 1 and b"Password (hidden): " in output:
            os.write(fd, (credentials["password"] + "\\r").encode()); stage = 2
else:
    os.kill(pid, 9)
    raise RuntimeError("Private login terminal timed out")
_, status = os.waitpid(pid, 0)
os.close(fd)
if credentials["password"].encode() in output:
    raise RuntimeError("Password was echoed by the login terminal")
if os.waitstatus_to_exitcode(status) != 0:
    raise RuntimeError("Private login command failed")
print(output.decode())
  `,
          process.execPath,
          mcp,
          origin,
        ],
        { cwd: temporary, env: environment, input: JSON.stringify(user), encoding: "utf8", timeout: 40_000 },
      );
      expect(terminalLogin.status, terminalLogin.stderr).toBe(0);
      expect(terminalLogin.stdout).toContain(user.displayName);
      const sessionFile = join(privateDirectory, (await readdir(privateDirectory))[0]);
      expect((await stat(sessionFile)).mode & 0o777).toBe(0o600);
      expect((await stat(privateDirectory)).mode & 0o777).toBe(0o700);
      const saved = await readFile(sessionFile, "utf8");
      expect(saved).not.toContain(user.password);
      cookie = `hall_session=${encodeURIComponent(JSON.parse(saved).token)}`;
      const status = spawnSync(process.execPath, [mcp, "status", "--url", origin], {
        cwd: temporary,
        env: environment,
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(status.status).toBe(0);
      expect(status.stdout).toContain(user.displayName);
      expect(status.stdout).not.toContain(JSON.parse(saved).token);
      authenticated = await connect(undefined);
    }
    const http = await connect(cookie, true);
    expect(unpack(await http.callTool({ name: "hall_learn", arguments: { topic: "connection" } })).topic).toBe(
      "connection",
    );
    expect(
      (await authenticated.callTool({ name: "workspace_read", arguments: { href: "/api/resources?path=" } })).isError,
    ).not.toBe(true);
    const created = await authenticated.callTool({
      name: "workspace_execute",
      arguments: {
        href: "/api/resources?path=",
        action: "resource.create",
        input: { kind: "text", path: "", name: "MCP test document", content: "Verified through installed MCP" },
      },
    });
    expect(created.isError, JSON.stringify(created)).not.toBe(true);
    const createdValue = unpack(created);
    const documentHref = createdValue.links.find((link) => link.rel.includes("self")).href;
    expect(
      JSON.stringify(await authenticated.callTool({ name: "workspace_read", arguments: { href: documentHref } })),
    ).toContain("Verified through installed MCP");
    expect((await anonymous.callTool({ name: "workspace_read", arguments: { href: documentHref } })).isError).toBe(
      true,
    );
    const foreign = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://foreign.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(foreign.status).toBe(403);
    const roleResponse = await request("/api/roles", {
      cookie,
      body: { name: "MCP reader", revision: 0, grants: [{ access: "read", condition: "always" }] },
    });
    expect(roleResponse.status).toBe(201);
    const role = (await roleResponse.json()).properties;
    expect(
      (await request("/api/users", { cookie, body: { ...reader, roles: [role.id], contactId: null } })).status,
    ).toBe(201);
    const login = await request("/api/auth/login", { body: reader });
    expect(login.status).toBe(200);
    const readerCookie = login.headers.get("set-cookie").split(";", 1)[0];
    const limited = await connect(readerCookie);
    expect((await limited.callTool({ name: "workspace_read", arguments: { href: documentHref } })).isError).not.toBe(
      true,
    );
    expect(
      (
        await request(`/api/roles/${role.id}`, {
          method: "PUT",
          cookie,
          body: { name: "No reading", revision: role.revision, grants: [] },
        })
      ).status,
    ).toBe(200);
    const denied = await limited.callTool({ name: "workspace_read", arguments: { href: documentHref } });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied)).toContain("403");
    const logout = spawnSync(process.execPath, [mcp, "logout", "--url", origin], {
      cwd: temporary,
      env: environment,
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(logout.status).toBe(0);
    expect(JSON.parse(logout.stdout)).toMatchObject({
      localSessionRemoved: true,
      serverSessionRevoked: process.platform !== "win32",
    });
    if (process.platform === "win32") {
      expect((await request("/api/auth/logout", { cookie, body: {} })).status).toBe(204);
      await expect(stat(privateDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    } else expect(await readdir(privateDirectory)).toEqual([]);
    expect((await authenticated.callTool({ name: "workspace_read", arguments: { href: documentHref } })).isError).toBe(
      true,
    );
    expect((await request("/mcp", { cookie, body: {} })).status).toBe(401);
    const renewed = await request("/api/auth/login", { body: user });
    cookie = renewed.headers.get("set-cookie").split(";", 1)[0];
    await database.pool.query("UPDATE public.sessions SET expires_at = $1", [new Date(0).toISOString()]);
    expect((await request("/mcp", { cookie, body: {} })).status).toBe(401);
    console.log(
      "Verified installed guide/stdio/HTTP, real login identity, document create/reread, anonymous/invalid/expired/revoked refusal, same-origin refusal and next-operation permission withdrawal. Disposable test identities only; POSIX checks private login/storage/logout, Windows checks refusal of private session storage.",
    );
  } finally {
    await Promise.allSettled(clients.map((client) => client.close()));
    if (running && running.exitCode === null) {
      const exited = once(running, "exit");
      running.kill("SIGTERM");
      await exited;
    }
    await database?.close();
    await rm(temporary, { recursive: true, force: true });
  }
}, 600_000);
