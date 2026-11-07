import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  it("keeps the newest archives and their manifests and leaves other files", async () => {
    const directory = await temporaryDirectory();
    const archives = Array.from(
      { length: 16 },
      (_, day) => `hall-hall_mairie-2026-11-${String(day + 1).padStart(2, "0")}T01-00-00-000Z.dump`,
    );
    for (const name of archives) {
      await writeFile(join(directory, name), "archive");
      await writeFile(join(directory, `${name}.json`), "{}");
    }
    await writeFile(join(directory, "avant-installation.dump"), "manual");

    const removed = await pruneArchives(directory, 14);

    expect(removed).toEqual(archives.slice(0, 2));
    const remaining = (await readdir(directory)).sort();
    expect(remaining.filter((name) => name.endsWith(".dump"))).toEqual(
      ["avant-installation.dump", ...archives.slice(2)].sort(),
    );
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
describe("Windows task registration script", () => {
  const script = windowsTasksScript({
    node: "C:\\Program Files\\nodejs\\node.exe",
    cli: "C:\\Hall\\releases\\1.0.3\\node_modules\\@ng-galien\\hall\\bin\\hall.mjs",
    environmentFile: "C:\\Hall\\config\\hall.env",
  });

  it("proves a first backup before registering any task", () => {
    const lines = script.split("\n");
    const index = (fragment: string) => lines.findIndex((line) => line.includes(fragment));
    expect(index("& $Node $Cli backup --env-file $Config")).toBeGreaterThan(0);
    expect(index("verify-backup --env-file $Config")).toBeGreaterThan(index("& $Node $Cli backup"));
    expect(index("Register-ScheduledTask")).toBeGreaterThan(index("verify-backup --env-file $Config"));
    expect(script).toContain("$ErrorActionPreference = 'Stop'");
  });

  it("registers a daily backup and a weekly verification that run without a signed-in user", () => {
    expect(script).toContain("$Node = 'C:\\Program Files\\nodejs\\node.exe'");
    expect(script).toContain(
      '$Backup = New-ScheduledTaskAction -Execute $Node -Argument \'"C:\\Hall\\releases\\1.0.3\\node_modules\\@ng-galien\\hall\\bin\\hall.mjs" backup --env-file "C:\\Hall\\config\\hall.env"\'',
    );
    expect(script).toContain('verify-backup --env-file "C:\\Hall\\config\\hall.env"\'');
    expect(script).toContain(
      "Register-ScheduledTask -Force -TaskName 'Hall - sauvegarde' -Action $Backup -Trigger (New-ScheduledTaskTrigger -Daily -At '02:00')",
    );
    expect(script).toContain("-TaskName 'Hall - verification de sauvegarde'");
    expect(script).toContain("New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '03:00'");
    expect(script).toContain('-UserId "$env:USERDOMAIN\\$env:USERNAME" -LogonType S4U');
    expect(script).toContain("-StartWhenAvailable -MultipleInstances IgnoreNew");
  });

  it("escapes single quotes of PowerShell literals", () => {
    const quoted = windowsTasksScript({
      node: "C:\\Program Files\\nodejs\\node.exe",
      cli: "C:\\Hall\\bin\\hall.mjs",
      environmentFile: "C:\\Mairie d'Alésia\\hall.env",
    });
    expect(quoted).toContain("$Config = 'C:\\Mairie d''Alésia\\hall.env'");
  });
});
