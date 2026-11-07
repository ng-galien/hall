import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { appendJsonLine, pruneArchives, windowsTasksScript } from "../standalone/operations.mjs";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "hall-operations-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
});

// @verifies-requirement HALL-TR-DST-020
describe("backup rotation", () => {
  it("keeps the newest archives of the database and never counts other files", async () => {
    const directory = await temporaryDirectory();
    const archives = Array.from(
      { length: 16 },
      (_, day) => `hall-hall_mairie-2026-11-${String(day + 1).padStart(2, "0")}T01-00-00-000Z.dump`,
    );
    for (const name of archives) {
      await writeFile(join(directory, name), "archive");
      await writeFile(join(directory, `${name}.json`), "{}");
    }
    const untouched = [
      "hall-avant-installation.dump",
      "hall-hall_mairie-avant-mise-a-jour.dump",
      "hall-hall_autre-2026-10-01T01-00-00-000Z.dump",
      "avant-installation.dump",
    ];
    for (const name of untouched) await writeFile(join(directory, name), "manual");

    const removed = await pruneArchives(directory, "hall_mairie", 14);

    expect(removed).toEqual(archives.slice(0, 2));
    const remaining = (await readdir(directory)).sort();
    expect(remaining.filter((name) => name.endsWith(".dump"))).toEqual([...untouched, ...archives.slice(2)].sort());
    expect(remaining.filter((name) => name.endsWith(".dump.json"))).toEqual(
      archives.slice(2).map((name) => `${name}.json`),
    );
  });

  it("appends one JSON line per operation outcome", async () => {
    const log = join(await temporaryDirectory(), "logs", "backup.log");
    await appendJsonLine(log, { operation: "backup", outcome: "succeeded", archive: "a.dump" });
    await appendJsonLine(log, { operation: "backup", outcome: "failed", error: "pg_dump failed" });

    const lines = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toMatchObject([
      { operation: "backup", outcome: "succeeded", archive: "a.dump" },
      { operation: "backup", outcome: "failed", error: "pg_dump failed" },
    ]);
    expect(Date.parse(String(lines[0].time))).not.toBeNaN();
  });
});

// @verifies-requirement HALL-TR-DST-020
describe("backup commands", () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));

  /** A copy of the standalone CLI beside the source tree, with a release record of its own. */
  async function standaloneCopy(): Promise<string> {
    const root = await temporaryDirectory();
    const server = join(root, "packages", "server");
    await mkdir(join(server, "standalone"), { recursive: true });
    for (const name of ["hall.mjs", "operations.mjs"])
      await copyFile(join(repository, "packages/server/standalone", name), join(server, "standalone", name));
    await symlink(join(repository, "packages/server/src"), join(server, "src"));
    await symlink(join(repository, "packages/server/package.json"), join(server, "package.json"));
    await symlink(join(repository, "packages/postgres"), join(root, "packages", "postgres"));
    await symlink(join(repository, "node_modules"), join(root, "node_modules"));
    await writeFile(
      join(server, "release.json"),
      JSON.stringify({ name: "@ng-galien/hall", version: "0.0.0-test", source: { commit: "test", dirty: true } }),
    );
    return root;
  }

  it("records the failure of backup and verify-backup in backup.log with credentials redacted", async () => {
    const root = await standaloneCopy();
    const configuration = join(root, "config");
    await mkdir(configuration);
    const environmentFile = join(configuration, "hall.env");
    await writeFile(
      environmentFile,
      "NODE_ENV=production\nDATABASE_URL=postgresql://hall_admin:not-a-real-secret@127.0.0.1:1/hall_mairie\nHALL_ALLOWED_ORIGINS=http://127.0.0.1:3100\n",
    );
    const cli = join(root, "packages/server/standalone/hall.mjs");
    for (const command of ["backup", "verify-backup"]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", cli, command, "--env-file", environmentFile], {
        cwd: repository,
        encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
      expect(result.status, result.stderr).toBe(1);
    }

    const lines = (await readFile(join(configuration, "logs", "backup.log"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toMatchObject([
      { operation: "backup", outcome: "failed" },
      { operation: "verify-backup", outcome: "failed", error: expect.stringContaining("No backup archive") },
    ]);
    expect(JSON.stringify(lines)).not.toContain("not-a-real-secret");
  });
});

// @verifies-requirement HALL-TR-DST-020
describe("Windows task registration script", () => {
  const inputs = {
    node: "C:\\Program Files\\nodejs\\node.exe",
    cli: "C:\\Hall\\releases\\1.0.3\\node_modules\\@ng-galien\\hall\\bin\\hall.mjs",
    environmentFile: "C:\\Hall\\config\\hall.env",
    postgresqlBin: "C:\\Program Files\\PostgreSQL\\17\\bin",
    backupDirectory: "C:\\Hall\\backups",
    database: "hall_mairie",
    backupLog: "C:\\Hall\\logs\\backup.log",
  };
  const script = windowsTasksScript(inputs);
  const lines = script.split("\n");
  const index = (fragment: string) => lines.findIndex((line) => line.includes(fragment));

  it("fixes the PostgreSQL tools, the folders and the log computed at generation", () => {
    expect(script).toContain("$PostgresqlBin = 'C:\\Program Files\\PostgreSQL\\17\\bin'");
    expect(script).toContain("$BackupDirectory = 'C:\\Hall\\backups'");
    expect(script).toContain("$ArchiveFilter = 'hall-hall_mairie-*.dump'");
    expect(script).toContain("$BackupLog = 'C:\\Hall\\logs\\backup.log'");
    expect(script).toContain('Write-Output "Outcome log: $BackupLog"');
    expect(index("foreach ($Tool in @('pg_dump.exe', 'pg_restore.exe'))")).toBeGreaterThan(0);
    expect(index("foreach ($Tool in")).toBeLessThan(index("Register-HallTask $TaskNames[0]"));
  });

  it("takes the account from the Hall task unless it is given", () => {
    expect(script).toContain("param([string]$Account, [switch]$StorePassword)");
    expect(script).toContain("$HallTask = Get-ScheduledTask -TaskName 'Hall' -ErrorAction SilentlyContinue");
    expect(script).toContain("$Account = $HallTask.Principal.UserId");
    expect(script).not.toContain("$env:USERNAME");
    expect(script).toContain("New-ScheduledTaskPrincipal -UserId $Account -LogonType S4U -RunLevel Limited");
    expect(script).toContain("-User $Account -Password $Credential.GetNetworkCredential().Password");
  });

  it("registers both tasks with the absolute tools folder in their arguments", () => {
    expect(script).toContain(
      `Register-HallTask $TaskNames[0] '"C:\\Hall\\releases\\1.0.3\\node_modules\\@ng-galien\\hall\\bin\\hall.mjs" backup --env-file "C:\\Hall\\config\\hall.env" --postgresql-bin "C:\\Program Files\\PostgreSQL\\17\\bin"' (New-ScheduledTaskTrigger -Daily -At '02:00')`,
    );
    expect(script).toContain(
      `verify-backup --env-file "C:\\Hall\\config\\hall.env" --postgresql-bin "C:\\Program Files\\PostgreSQL\\17\\bin"' (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '03:00')`,
    );
    expect(script).toContain("$TaskNames = @('Hall - sauvegarde', 'Hall - verification de sauvegarde')");
    expect(script).toContain("-StartWhenAvailable -MultipleInstances IgnoreNew");
  });

  it("runs the backup task once through Task Scheduler and removes both tasks when it fails", () => {
    expect(index("Start-ScheduledTask -TaskName $Name")).toBeGreaterThan(0);
    expect(script).toContain("if ($Info.LastTaskResult -ne 0) { throw");
    expect(script).toContain(
      "if (($State -eq 'Ready') -and ($Info.LastRunTime -lt $Started) -and ((Get-Date) -gt $StartDeadline)) {",
    );
    expect(script).toContain("did not start within 60 seconds (LastTaskResult $($Info.LastTaskResult))");
    expect(index("$Started = Invoke-HallTask $TaskNames[0]")).toBeGreaterThan(index("Register-HallTask $TaskNames[1]"));
    expect(
      index("$NewArchives = @(Get-ChildItem -LiteralPath $BackupDirectory -Filter $ArchiveFilter"),
    ).toBeGreaterThan(index("$Started = Invoke-HallTask $TaskNames[0]"));
    expect(script).toContain("if ($NewArchives.Count -eq 0) { throw");
    expect(index("} catch {")).toBeGreaterThan(index("Invoke-HallTask $TaskNames[1]"));
    expect(index("Unregister-ScheduledTask -TaskName $Name -Confirm:$false")).toBeGreaterThan(index("} catch {"));
    expect(script).not.toContain("& $Node $Cli backup");
  });

  it("escapes single quotes of PowerShell literals", () => {
    const quoted = windowsTasksScript({ ...inputs, environmentFile: "C:\\Mairie d'Alésia\\hall.env" });
    expect(quoted).toContain("$Config = 'C:\\Mairie d''Alésia\\hall.env'");
  });
});
