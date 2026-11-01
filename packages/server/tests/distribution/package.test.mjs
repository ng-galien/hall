import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { cp, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PDFDocument } from "pdf-lib";
import { Pool } from "pg";
import { expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((accept) => server.close(accept));
  return port;
}

// @verifies-requirement HALL-TR-DST-010
const verifiesMigration = process.env.HALL_PACKAGE_TEST_UPGRADE === "true";
it(
  verifiesMigration
    ? "rehearses schema convergence on a restored copy with the npm runtime"
    : "runs the packed server outside the checkout and preserves external data through replacement and restore",
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hall-npm-"));
    const prefix = join(temporary, "installation with spaces");
    const envFile = join(temporary, "hall.env");
    const databasePort = await freePort();
    const httpPort = await freePort();
    const externalDatabase = process.env.HALL_PACKAGE_TEST_DATABASE_URL;
    const databaseName = `hall_package_${randomUUID().replaceAll("-", "")}`;
    const restoreName = `${databaseName}_restore`;
    const connection = new URL(externalDatabase ?? `postgresql://hall_package_test@127.0.0.1:${databasePort}/postgres`);
    connection.pathname = `/${databaseName}`;
    const url = connection.href;
    const origin = `http://127.0.0.1:${httpPort}`;
    const environment = {
      PATH: process.env.PATH,
      TMPDIR: temporary,
      TEMP: temporary,
      TMP: temporary,
      // Windows requires its system paths; do not inherit Hall or database secrets.
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          ["systemroot", "windir", "comspec", "pathext", "appdata", "localappdata", "userprofile"].includes(
            key.toLowerCase(),
          ),
        ),
      ),
      NODE_PATH: "",
      PLAYWRIGHT_BROWSERS_PATH: join(tmpdir(), "hall-distribution-browser-cache"),
      npm_config_cache: join(tmpdir(), "hall-distribution-npm-cache"),
      npm_config_fetch_timeout: "30000",
      npm_config_fetch_retries: "1",
      npm_config_update_notifier: "false",
    };
    function command(executable, args, options = {}) {
      if (executable === "npm") {
        if (!process.env.npm_execpath) throw new Error("Run distribution tests through npm");
        args = [process.env.npm_execpath, ...args];
        executable = process.execPath;
      }
      const result = spawnSync(executable, args, {
        cwd: temporary,
        env: environment,
        encoding: "utf8",
        timeout: 600_000,
        maxBuffer: 8 * 1024 * 1024,
        ...options,
      });
      if (result.error) throw result.error;
      return result;
    }
    function run(executable, args, options) {
      console.log(`Run ${executable} ${args[0] ?? ""}`);
      const result = command(executable, args, options);
      expect(result.status, `${executable}: ${result.stderr}\n${result.stdout}`).toBe(0);
      return result.stdout;
    }
    let running;
    let pool;
    let container;
    let maintenance;
    const installed = join(prefix, "node_modules/@ng-galien/hall");
    const cli = join(installed, "bin/hall.mjs");
    async function stop(signal = "SIGTERM") {
      if (!running) return;
      const child = running;
      running = undefined;
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill(signal);
      let forced = false;
      const timeout = setTimeout(() => {
        forced = true;
        child.kill("SIGKILL");
      }, 10_000);
      try {
        await exited;
        if (forced) throw new Error("Server did not stop within ten seconds");
      } finally {
        clearTimeout(timeout);
      }
    }
    async function start() {
      console.log("Start installed server");
      let output = "";
      running = spawn(process.execPath, [cli, "start", "--env-file", envFile], {
        cwd: temporary,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      running.stdout.on("data", (data) => {
        output += data;
      });
      running.stderr.on("data", (data) => {
        output += data;
      });
      for (let attempt = 0; attempt < 300; attempt++) {
        if (running.exitCode !== null) throw new Error(`Installed server exited: ${output}`);
        try {
          const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) });
          if (response.ok) return;
        } catch {
          await delay(100);
          continue;
        }
        await delay(100);
      }
      throw new Error(`Installed server did not become ready: ${output}`);
    }
    const administrator = { email: "admin@hall.example", displayName: "Package administrator", password: randomUUID() };
    const collaborator = { email: "reader@hall.example", displayName: "Package reader", password: randomUUID() };
    let cookie = "";
    async function request(path, { method = "GET", body, session = cookie } = {}) {
      return fetch(`${origin}/api${path}`, {
        method,
        headers: { "content-type": "application/json", accept: "application/vnd.siren+json", cookie: session },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function login(credentials = administrator) {
      const response = await request("/auth/login", { method: "POST", body: credentials, session: "" });
      expect(response.status, await response.clone().text()).toBe(200);
      return response.headers.get("set-cookie").split(";")[0];
    }
    async function resource(id) {
      const response = await request(`/resources/${id}`);
      expect(response.status).toBe(200);
      const body = await response.json();
      return body.properties ?? body;
    }
    try {
      const rootMetadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      const tarball =
        process.env.HALL_PACKAGE_TEST_ARCHIVE ?? join(root, `dist/npm/ng-galien-hall-${rootMetadata.version}.tgz`);
      const expectedDigest = (await readFile(`${tarball}.sha256`, "utf8")).trim().split(/\s+/)[0];
      expect(
        createHash("sha256")
          .update(await readFile(tarball))
          .digest("hex"),
      ).toBe(expectedDigest);
      run("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund", tarball]);
      const metadata = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
      expect(metadata.private).not.toBe(true);
      expect(metadata.scripts).toBeUndefined();
      const release = JSON.parse(await readFile(join(installed, "release.json"), "utf8"));
      const installationLock = JSON.parse(await readFile(join(prefix, "package-lock.json"), "utf8"));
      const catalogName = "@ng-galien/postgresql-catalog";
      const catalogEntries = Object.entries(installationLock.packages).filter(([path]) =>
        path.endsWith(`node_modules/${catalogName}`),
      );
      expect(catalogEntries).toHaveLength(1);
      const catalog = catalogEntries[0][1];
      expect(metadata.dependencies[catalogName]).toBe(catalog.version);
      expect(catalog.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//);
      expect(release.runtimeDependencies[catalogName]).toEqual({
        version: catalog.version,
        resolved: catalog.resolved,
        integrity: catalog.integrity,
      });
      expect(release).not.toHaveProperty("bundledCatalog");
      expect(Object.keys(metadata.dependencies).some((name) => name.startsWith("@hall/"))).toBe(false);
      expect(Object.values(metadata.dependencies).some((version) => /^(file:|link:)/.test(version))).toBe(false);
      expect(run(process.execPath, [cli, "--version"])).toContain(rootMetadata.version);
      expect(run("npm", ["exec", "--prefix", prefix, "--no", "--", "hall", "--version"])).toContain(
        rootMetadata.version,
      );
      expect(run(process.execPath, [cli, "--help"])).toContain("hall start");
      run(process.execPath, [cli, "install-browser"]);
      expect(command(process.execPath, [cli, "start"]).stderr).toContain("DATABASE_URL is required");
      const insideConfig = join(installed, "bad.env");
      await writeFile(insideConfig, "DATABASE_URL=postgresql://unused\n");
      expect(command(process.execPath, [cli, "start", "--env-file", insideConfig]).stderr).toContain(
        "outside the installed package",
      );
      await rm(insideConfig);
      const contents = run("tar", ["-tzf", tarball]);
      expect(contents).not.toMatch(/local-imports|\.trust\/|\/src\/|\.env$/m);
      expect(contents).toContain("package/client/index.html");
      expect(contents).toContain("package/municipal-bootstrap.md");
      expect(await readFile(join(installed, "municipal-bootstrap.md"), "utf8")).toBe(
        await readFile(join(root, "docs/municipal-bootstrap.md"), "utf8"),
      );
      expect(contents).toContain("package/sql/migrations/001-agenda-subject-text-lock.sql");

      if (!externalDatabase)
        container = run(
          "docker",
          [
            "run",
            "--detach",
            "--rm",
            "--pull=never",
            "--publish",
            `127.0.0.1:${databasePort}:5432`,
            "--tmpfs",
            "/var/lib/postgresql/data",
            "--env",
            "POSTGRES_USER=hall_package_test",
            "--env",
            "POSTGRES_DB=postgres",
            "--env",
            "POSTGRES_HOST_AUTH_METHOD=trust",
            "postgres:17-alpine",
          ],
          { env: process.env },
        ).trim();
      for (let attempt = 0; container; attempt++) {
        const ready = command(
          "docker",
          ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "hall_package_test"],
          {
            env: process.env,
          },
        );
        if (ready.status === 0) break;
        if (attempt > 100) throw new Error("Disposable PostgreSQL did not become ready");
        await delay(100);
      }
      const maintenanceConnection = new URL(connection);
      maintenanceConnection.pathname = "/postgres";
      maintenance = new Pool({ connectionString: maintenanceConnection.href });
      await maintenance.query(`CREATE DATABASE "${databaseName}"`);
      pool = new Pool({ connectionString: url });
      const backups = join(temporary, "hall backups");
      const configuration = `NODE_ENV=production\nLOG_LEVEL=info\nDATABASE_URL=${url}\nSERVER_HOST=127.0.0.1\nSERVER_PORT=${httpPort}\nHALL_BACKUP_DIRECTORY=${backups}\nHALL_BACKUP_RETENTION=2\n`;
      await writeFile(envFile, configuration, { mode: 0o600 });
      const empty = command(process.execPath, [cli, "schema-check", "--env-file", envFile]);
      expect(empty.status).not.toBe(0);
      expect((await pool.query("SELECT to_regnamespace('hall') AS value")).rows[0].value).toBeNull();
      const emptyStart = command(process.execPath, [cli, "start", "--env-file", envFile], { timeout: 30_000 });
      expect(emptyStart.status).not.toBe(0);
      expect(emptyStart.stderr).toContain("hall migrate");
      expect((await pool.query("SELECT to_regnamespace('hall') AS value")).rows[0].value).toBeNull();
      expect((await pool.query("SELECT to_regclass('public.users') AS value")).rows[0].value).toBeNull();
      expect(run(process.execPath, [cli, "migrate", "--env-file", envFile])).toContain("schema installed");
      expect(run(process.execPath, [cli, "migrate", "--env-file", envFile])).toContain("schema verified");
      await start();
      const runningVersion = `${release.version}:${release.source.commit}:${release.source.dirty ? "dirty" : "clean"}`;
      expect(await (await request("/health")).json()).toEqual({ status: "ok", version: runningVersion });
      const persistentLog = join(temporary, "logs/hall.log");
      await expect.poll(async () => readFile(persistentLog, "utf8")).toContain("Hall server started");
      expect(await readFile(persistentLog, "utf8")).toContain(runningVersion);
      if (process.platform !== "win32") {
        expect((await stat(persistentLog)).mode & 0o777).toBe(0o600);
        expect((await stat(join(temporary, "logs"))).mode & 0o777).toBe(0o700);
      }
      expect((await request("/users", { session: "" })).status).toBe(401);
      expect((await (await request("/auth/status")).json()).properties.bootstrapRequired).toBe(true);
      const bootstrap = await request("/auth/bootstrap", { method: "POST", body: administrator });
      expect(bootstrap.status, await bootstrap.clone().text()).toBe(201);
      cookie = bootstrap.headers.get("set-cookie").split(";")[0];
      const administratorId = (await bootstrap.json()).properties.id;
      const account = await request("/users", {
        method: "POST",
        body: { ...collaborator, roles: ["contributor"], contactId: null },
      });
      expect(account.status, await account.clone().text()).toBe(201);
      const accountBefore = (await account.json()).properties;
      const initialSettings = (await (await request("/settings")).json()).properties;
      const settingsUpdate = { ...initialSettings, name: "Municipality preservation probe", city: "Restore probe" };
      const settingsResponse = await request("/settings", { method: "PUT", body: settingsUpdate });
      expect(settingsResponse.status, await settingsResponse.clone().text()).toBe(200);
      const settingsBefore = (await settingsResponse.json()).properties;
      const readerCookie = await login(collaborator);
      expect((await request("/users", { session: readerCookie })).status).toBe(403);
      const readerSettings = await (await request("/settings", { session: readerCookie })).json();
      expect(readerSettings.properties).toEqual(settingsBefore);
      expect(readerSettings.actions ?? []).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "settings.update" })]),
      );
      expect((await request("/settings", { method: "PUT", body: settingsUpdate, session: readerCookie })).status).toBe(
        403,
      );
      expect((await request(`/users/${administratorId}/disable`, { method: "POST" })).status).toBe(409);
      const page = await fetch(`${origin}/app/`);
      expect(page.status).toBe(200);
      const html = await page.text();
      const assetPath = html.match(/(?:src|href)="(\/app\/assets\/[^"]+\.js)"/)?.[1];
      expect(assetPath).toBeTruthy();
      const asset = await fetch(`${origin}${assetPath}`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toMatch(/javascript/);
      const created = await request("/resources", {
        method: "POST",
        body: {
          kind: "text",
          name: "Package preservation probe",
          path: "",
          content: "Retain this exact content across npm replacement.",
        },
      });
      expect(created.status, await created.clone().text()).toBe(201);
      const createdBody = await created.json();
      const id = (createdBody.properties ?? createdBody).id;
      const before = await resource(id);
      expect(before.content).toBe("Retain this exact content across npm replacement.");
      const documentBytes = Buffer.from("%PDF-1.4\n% Hall binary preservation probe\n%%EOF\n");
      const upload = new FormData();
      upload.set("file", new Blob([documentBytes], { type: "application/pdf" }), "preserved.pdf");
      upload.set("path", "");
      const documentResponse = await fetch(`${origin}/api/resources/documents`, {
        method: "POST",
        headers: { cookie },
        body: upload,
      });
      expect(documentResponse.status, await documentResponse.clone().text()).toBe(201);
      const documentId = (await documentResponse.json()).properties.id;
      async function verifyDocument() {
        const response = await request(`/resources/${documentId}/content`);
        expect(response.status).toBe(200);
        expect(Buffer.from(await response.arrayBuffer())).toEqual(documentBytes);
      }
      await verifyDocument();
      async function verifyPdfRendering() {
        const response = await request("/templates/preview-pdf", {
          method: "POST",
          body: { bodyMarkdown: "# Municipal installation\n\nPDF generation from the installed package." },
        });
        expect(response.status, response.ok ? undefined : await response.clone().text()).toBe(200);
        expect(response.headers.get("content-type")).toContain("application/pdf");
        const document = await PDFDocument.load(await response.arrayBuffer());
        expect(document.getPageCount()).toBe(1);
      }
      await verifyPdfRendering();
      run(process.execPath, [cli, "schema-check", "--env-file", envFile]);

      await stop("SIGKILL");
      await start();
      expect(await resource(id)).toEqual(before);
      await verifyDocument();
      await stop();
      // An older public user layout must not be silently migrated by startup,
      // even when the managed Hall fingerprint already matches.
      await pool.query("ALTER TABLE public.users RENAME COLUMN contact_id TO council_member_id");
      const legacyStart = command(process.execPath, [cli, "start", "--env-file", envFile], { timeout: 30_000 });
      expect(legacyStart.status).not.toBe(0);
      expect(legacyStart.stderr).toContain("Server user schema requires migration");
      expect(
        (
          await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='council_member_id'",
          )
        ).rows,
      ).toHaveLength(1);
      run(process.execPath, [cli, "migrate", "--env-file", envFile]);
      await start();
      cookie = await login();
      expect((await (await request(`/users/${accountBefore.id}`)).json()).properties).toEqual(accountBefore);
      expect(await resource(id)).toEqual(before);
      await stop();
      await pool.query("ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_role_check");
      const missingInvariantStart = command(process.execPath, [cli, "start", "--env-file", envFile], {
        timeout: 30_000,
      });
      expect(missingInvariantStart.status).not.toBe(0);
      expect(missingInvariantStart.stderr).toContain("Server schema invariants require migration");
      expect(
        (
          await pool.query(
            "SELECT conname FROM pg_constraint WHERE conrelid='public.user_roles'::regclass AND conname='user_roles_role_check'",
          )
        ).rows,
      ).toHaveLength(0);
      run(process.execPath, [cli, "migrate", "--env-file", envFile]);
      await start();
      expect(await resource(id)).toEqual(before);
      await stop();
      // @verifies-requirement HALL-TR-DST-020
      for (let attempt = 0; attempt < 3; attempt++) {
        expect(run(process.execPath, [cli, "backup", "--env-file", envFile])).toContain("Backup written");
      }
      const archives = (await readdir(backups)).filter((name) => name.endsWith(".dump")).sort();
      expect(archives).toHaveLength(2);
      for (const name of archives) {
        const manifest = JSON.parse(await readFile(join(backups, `${name}.json`), "utf8"));
        expect(manifest.sha256).toBe(
          createHash("sha256")
            .update(await readFile(join(backups, name)))
            .digest("hex"),
        );
        expect(manifest.hall.version).toBe(rootMetadata.version);
        expect(manifest.database).toBe(databaseName);
      }
      const dump = join(backups, archives.at(-1));
      expect(run(process.execPath, [cli, "verify-backup", "--env-file", envFile])).toContain("Backup verified");
      expect(
        (await maintenance.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'hall_verify_%'"))
          .rows[0].count,
      ).toBe(0);
      const altered = join(temporary, "altered.dump");
      const alteredBytes = await readFile(dump);
      alteredBytes[alteredBytes.length - 1] ^= 0xff;
      await writeFile(altered, alteredBytes);
      await cp(`${dump}.json`, `${altered}.json`);
      const refused = command(process.execPath, [cli, "verify-backup", "--env-file", envFile, "--archive", altered]);
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain("does not match its manifest");
      const digest = createHash("sha256")
        .update(await readFile(dump))
        .digest("hex");

      const nextPackage = join(temporary, "next-package");
      await cp(installed, nextPackage, { recursive: true });
      const nextMetadata = { ...metadata, version: `${rootMetadata.version}-replacement.1` };
      await writeFile(join(nextPackage, "package.json"), JSON.stringify(nextMetadata));
      run("npm", ["pack", "--ignore-scripts", "--pack-destination", temporary], { cwd: nextPackage });
      run("npm", [
        "install",
        "--prefix",
        prefix,
        "--no-audit",
        "--no-fund",
        join(temporary, `ng-galien-hall-${nextMetadata.version}.tgz`),
      ]);
      expect(await readFile(envFile, "utf8")).toBe(configuration);
      expect(run(process.execPath, [cli, "--version"])).toContain(nextMetadata.version);
      await start();
      expect(await resource(id)).toEqual(before);
      await verifyDocument();
      await stop();

      const fingerprint = (await pool.query("SELECT manifest_sha256 FROM hall_meta.schema_contract")).rows[0]
        .manifest_sha256;
      await pool.query("UPDATE hall_meta.schema_contract SET manifest_sha256 = repeat('0', 64)");
      const mismatch = command(process.execPath, [cli, "schema-check", "--env-file", envFile]);
      expect(mismatch.status).not.toBe(0);
      expect(mismatch.stderr).toContain("fingerprint differs");
      const mismatchStart = command(process.execPath, [cli, "start", "--env-file", envFile], { timeout: 30_000 });
      expect(mismatchStart.status).not.toBe(0);
      expect(mismatchStart.stderr).toContain("hall migrate");
      expect((await pool.query("SELECT manifest_sha256 FROM hall_meta.schema_contract")).rows[0].manifest_sha256).toBe(
        "0".repeat(64),
      );
      await pool.query("UPDATE hall_meta.schema_contract SET manifest_sha256 = $1", [fingerprint]);

      await maintenance.query(`CREATE DATABASE "${restoreName}"`);
      const restoredUrl = new URL(url);
      restoredUrl.pathname = `/${restoreName}`;
      expect(
        createHash("sha256")
          .update(await readFile(dump))
          .digest("hex"),
      ).toBe(digest);
      run("pg_restore", ["--exit-on-error", "--dbname", restoredUrl.href, dump]);
      const restoredPrivileges = new Pool({ connectionString: restoredUrl.href, max: 1 });
      try {
        expect(
          (
            await restoredPrivileges.query(
              "SELECT bool_and(has_schema_privilege(role, 'hall_api', 'USAGE')) AS granted FROM unnest(ARRAY['hall_api_authenticated','hall_api_worker']) AS role",
            )
          ).rows[0].granted,
        ).toBe(true);
      } finally {
        await restoredPrivileges.end();
      }
      const restoredConfig = configuration.replace(url, restoredUrl.href);
      await writeFile(envFile, restoredConfig);
      run(process.execPath, [cli, "schema-check", "--env-file", envFile]);
      await start();
      expect(await resource(id)).toEqual(before);
      await verifyDocument();
      cookie = await login();
      expect((await (await request("/auth/status")).json()).properties.bootstrapRequired).toBe(false);
      expect((await request("/auth/bootstrap", { method: "POST", body: administrator })).status).toBe(409);
      expect((await (await request(`/users/${accountBefore.id}`)).json()).properties).toEqual(accountBefore);
      expect((await (await request("/settings")).json()).properties).toEqual(settingsBefore);
      const restoredReader = await login(collaborator);
      await verifyPdfRendering();
      expect((await request("/users", { session: restoredReader })).status).toBe(403);
      expect(
        (await request("/settings", { method: "PUT", body: settingsUpdate, session: restoredReader })).status,
      ).toBe(403);
      if (verifiesMigration) {
        await stop();
        console.log("Rehearse schema convergence on restored database");
        const restored = new Pool({ connectionString: restoredUrl.href });
        try {
          await restored.query("ALTER TABLE hall_meta.schema_contract DROP COLUMN installed_at");
          await restored.query("UPDATE hall_meta.schema_contract SET manifest_sha256 = repeat('0', 64)");
          const migrationPath = join(installed, "sql/migrations/001-agenda-subject-text-lock.sql");
          const migration = await readFile(migrationPath, "utf8");
          await writeFile(
            migrationPath,
            `${migration}\nDO $$ BEGIN RAISE EXCEPTION 'distribution rollback probe'; END $$;\n`,
          );
          const failedMigration = command(process.execPath, [cli, "migrate", "--env-file", envFile]);
          expect(failedMigration.status).not.toBe(0);
          expect(failedMigration.stderr).toContain("distribution rollback probe");
          expect(
            (await restored.query("SELECT manifest_sha256 FROM hall_meta.schema_contract")).rows[0].manifest_sha256,
          ).toBe("0".repeat(64));
          expect(
            (
              await restored.query(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='hall_meta' AND table_name='schema_contract' AND column_name='installed_at'",
              )
            ).rows,
          ).toHaveLength(0);
          await writeFile(migrationPath, migration);
          await restored.query("CREATE TABLE public.unexpected_update_probe (id integer)");
          const failedServerInitialization = command(process.execPath, [cli, "migrate", "--env-file", envFile]);
          expect(failedServerInitialization.status).not.toBe(0);
          expect(failedServerInitialization.stderr).toContain("Unsupported PostgreSQL schema");
          expect(
            (await restored.query("SELECT manifest_sha256 FROM hall_meta.schema_contract")).rows[0].manifest_sha256,
          ).toBe("0".repeat(64));
          expect(
            (
              await restored.query(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='hall_meta' AND table_name='schema_contract' AND column_name='installed_at'",
              )
            ).rows,
          ).toHaveLength(0);
          await restored.query("DROP TABLE public.unexpected_update_probe");
          expect(run(process.execPath, [cli, "migrate", "--env-file", envFile])).toContain("schema upgraded");
          expect(run(process.execPath, [cli, "migrate", "--env-file", envFile])).toContain("schema verified");
          await start();
          expect(await resource(id)).toEqual(before);
          await verifyDocument();
          await verifyPdfRendering();
          cookie = await login();
          expect((await (await request(`/users/${accountBefore.id}`)).json()).properties).toEqual(accountBefore);
          expect((await (await request("/settings")).json()).properties).toEqual(settingsBefore);
          expect(
            (await restored.query("SELECT manifest_sha256 FROM hall_meta.schema_contract")).rows[0].manifest_sha256,
          ).toBe(fingerprint);
          expect(
            (await restored.query("SELECT installed_at FROM hall_meta.schema_contract")).rows[0].installed_at,
          ).toBeTruthy();
        } finally {
          await restored.end();
        }
      }
      console.log(
        "Verified production bootstrap, administrator and reader access, restored accounts and settings, packed install, HTTP client assets, public API data, installed Chromium PDF rendering, interrupted process restart, npm version replacement, read-only mismatch refusal and restoration of the selected dump.",
      );
    } finally {
      try {
        await stop();
        await pool?.end();
        if (maintenance) {
          try {
            const targets = await maintenance.query(
              `SELECT datname FROM pg_database
               WHERE shobj_description(oid, 'pg_database') = $1
                 AND datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user)`,
              [`hall-schema-target:v1:${restoreName}`],
            );
            for (const { datname } of targets.rows) {
              await maintenance.query(`DROP DATABASE "${datname.replaceAll('"', '""')}" WITH (FORCE)`);
            }
            await maintenance.query(`DROP DATABASE IF EXISTS "${restoreName}" WITH (FORCE)`);
            await maintenance.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
          } finally {
            await maintenance.end();
          }
        }
      } finally {
        if (container) run("docker", ["stop", "--time", "3", container], { env: process.env });
        await rm(temporary, { recursive: true, force: true });
      }
    }
  },
);
