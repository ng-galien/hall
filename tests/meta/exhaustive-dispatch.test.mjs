import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ignoredDirectories = new Set(["coverage", "dist", "node_modules", "out"]);
const typescriptExtensions = new Set([".cts", ".mts", ".ts", ".tsx"]);

function sourceFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) return typescriptExtensions.has(extname(path)) ? [path] : [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => !ignoredDirectories.has(entry.name))
    .flatMap((entry) => sourceFiles(join(path, entry.name)));
}

function switchLocations(path, source = readFileSync(path, "utf8")) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const locations = [];
  const visit = (node) => {
    if (ts.isSwitchStatement(node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      locations.push(position.line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return locations;
}

function violations(paths) {
  return paths
    .map((path) => resolve(path))
    .flatMap(sourceFiles)
    .flatMap((path) => switchLocations(path).map((line) => `${relative(process.cwd(), path)}:${line}`));
}

const requestedFile = process.env.HALL_DISPATCH_FILE;
const cases = [
  { name: "text mentioning switch", source: 'export const label = "switch";\n// switch (value) {}\n', rejected: false },
  {
    name: "switch inside a function",
    source: "export function choose(value) { switch (value) { default: return 1; } }",
    rejected: true,
  },
];

if (requestedFile) {
  test("edited TypeScript keeps exhaustive dispatch", () => {
    assert.deepEqual(violations([requestedFile]), []);
  });
} else {
  test("Hall TypeScript keeps exhaustive dispatch", () => {
    assert.deepEqual(violations([join(root, "packages")]), []);
  });

  for (const scenario of cases) {
    test(`AST rejects statements, not prose: ${scenario.name}`, () => {
      const found = switchLocations("probe.tsx", scenario.source);
      assert.equal(found.length > 0, scenario.rejected);
    });
  }

  for (const backend of ["codex", "claude"]) {
    for (const scenario of cases) {
      test(`${backend} post-edit hook checks the written TypeScript: ${scenario.name}`, () => {
        const fixture = mkdtempSync(join(tmpdir(), "hall-dispatch-hook-"));
        try {
          const source = join(fixture, "packages/domain/src/probe.ts");
          mkdirSync(dirname(source), { recursive: true });
          copyFileSync(join(root, ".code-moniker.toml"), join(fixture, ".code-moniker.toml"));
          writeFileSync(source, scenario.source);
          const result = spawnSync("sh", [join(root, `.${backend}/hooks/code-moniker-check.sh`)], {
            cwd: fixture,
            env: { ...process.env, [`${backend.toUpperCase()}_PROJECT_DIR`]: fixture },
            input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: source, content: scenario.source } }),
            encoding: "utf8",
            timeout: 30_000,
          });
          assert.ifError(result.error);
          assert.equal(result.status, scenario.rejected ? 2 : 0, result.stderr);
        } finally {
          rmSync(fixture, { recursive: true, force: true });
        }
      });
    }
  }
}
