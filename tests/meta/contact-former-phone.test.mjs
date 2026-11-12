import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

function files(directory, extensions) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (["node_modules", "dist"].includes(name)) return [];
    if (statSync(path).isDirectory()) return files(path, extensions);
    return extensions.some((extension) => name.endsWith(extension)) && !/\.test\.[a-z]+$/.test(name) ? [path] : [];
  });
}

function occurrences(paths, pattern, unrelated = /$^/) {
  const counts = {};
  for (const path of paths) {
    const count = readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => pattern.test(line) && !unrelated.test(line)).length;
    if (count > 0) counts[relative(root, path)] = count;
  }
  return counts;
}

// @verifies-requirement HALL-FR-DIR-170
test("the former free-text telephone of a contact is declared once and read only by its copy migration", () => {
  const sql = files(join(root, "packages/postgres/sql"), [".sql"]).filter((path) => !path.includes("/test/"));
  expect(occurrences(sql, /(^|[^A-Za-z0-9_])phone([^A-Za-z0-9_]|$)/)).toEqual({
    // The column and its former blank-value constraint, untouched in this version.
    "packages/postgres/sql/directory/010-model.sql": 2,
    // The copy into the three numbers.
    "packages/postgres/sql/migrations/009-contact-phone-numbers.sql": 7,
    // The telephone of the commune, a different field.
    "packages/postgres/sql/administration/010-model.sql": 1,
    "packages/postgres/sql/administration/020-api.sql": 1,
    "packages/postgres/sql/migrations/007-server-tables-into-hall.sql": 1,
  });
});

// @verifies-requirement HALL-FR-DIR-170
test("no contract, adapter, server, interface or seed carries a single contact telephone", () => {
  const sources = [
    ...["api-contract", "contracts", "domain", "postgres", "server", "mcp", "client", "templating"].flatMap((name) =>
      files(join(root, "packages", name, "src"), [".ts", ".tsx", ".mjs", ".js"]),
    ),
    ...files(join(root, "scripts/seed"), [".mjs", ".js", ".ts"]),
  ];
  // The phone layout of the interface is a boolean, not a telephone.
  const layout = /phone\??:\s*boolean|\? "phone"/;
  expect(occurrences(sources, /(^|[^A-Za-z0-9_$])phone\??\s*:|\.phone\b|["']phone["']/, layout)).toEqual({
    // The telephone of the commune in its settings.
    "packages/client/src/features/settings/CommuneSettings.tsx": 2,
    "packages/client/src/services/hallSettingsApi.ts": 1,
    "packages/domain/src/model.ts": 1,
    "packages/domain/src/schemas.ts": 1,
    "packages/server/src/repositories/hallSettingsRepository.ts": 1,
    "scripts/seed/data/datasets/alesia/directory.mjs": 1,
  });
});
