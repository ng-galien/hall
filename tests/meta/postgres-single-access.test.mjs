import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const schemaSourceRoot = "packages/postgres/sql/";
const skippedDirectories = new Set(["node_modules", "dist", "out", ".git"]);
const ddlStatement = /\b(CREATE(\s+OR\s+REPLACE)?(\s+UNIQUE)?\s+(TABLE|INDEX|FUNCTION)|ALTER\s+TABLE)\b/i;
const publicSchemaReference = /(\bpublic\.[a-z_"]|search_path\s*(=|to)\s*['"]?public\b)/i;

const formerPublicPathReaders = new Set(["packages/postgres/sql/migrations/", "packages/postgres/sql/test/"]);

function sqlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return skippedDirectories.has(entry.name) ? [] : sqlFiles(join(directory, entry.name));
    return entry.name.endsWith(".sql") ? [join(directory, entry.name)] : [];
  });
}

function repositoryPath(path) {
  return relative(root, path).split(sep).join("/");
}

function findings(paths, pattern) {
  return paths.flatMap((path) =>
    readFileSync(join(root, path), "utf8")
      .split("\n")
      .flatMap((line, index) =>
        pattern.test(line.replace(/--.*$/, "")) ? [`${path}:${index + 1}: ${line.trim()}`] : [],
      ),
  );
}

const repositorySqlFiles = sqlFiles(join(root, "packages")).map(repositoryPath);

test("PostgreSQL DDL is declared only in the SQL files of packages/postgres/sql", () => {
  const outside = repositorySqlFiles.filter((path) => !path.startsWith(schemaSourceRoot));
  assert.deepEqual(
    findings(outside, ddlStatement),
    [],
    "Move these CREATE or ALTER statements into packages/postgres/sql so that the schema manifest installs and upgrades them.",
  );
});

test("Hall schema SQL never targets the public schema", () => {
  const schemaFiles = repositorySqlFiles.filter(
    (path) =>
      path.startsWith(schemaSourceRoot) && ![...formerPublicPathReaders].some((reader) => path.startsWith(reader)),
  );
  assert.ok(schemaFiles.length > 0, "The Hall schema SQL files must be found under packages/postgres/sql.");
  assert.deepEqual(
    findings(schemaFiles, publicSchemaReference),
    [],
    "Name the Hall schema instead of public. Reading the former public tables belongs to a migration in packages/postgres/sql/migrations.",
  );
});
