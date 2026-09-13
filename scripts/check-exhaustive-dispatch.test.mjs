import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const checker = join(root, "scripts/check-exhaustive-dispatch.mjs");
const cases = [
  { name: "text mentioning switch", source: 'export const label = "switch";\n// switch (value) {}\n', rejected: false },
  { name: "switch inside a function", source: 'export function choose(value) { switch (value) { default: return 1; } }', rejected: true },
];

for (const scenario of cases) {
  test(`AST rejects statements, not prose: ${scenario.name}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "hall-dispatch-"));
    try {
      const source = join(fixture, "probe.tsx");
      writeFileSync(source, scenario.source);
      const result = spawnSync(process.execPath, [checker, source], { encoding: "utf8" });
      assert.ifError(result.error);
      assert.equal(result.status, scenario.rejected ? 1 : 0, result.stderr);
      if (scenario.rejected) assert.match(result.stderr, /Switch statements bypass Hall's exhaustive matcher authority/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}

for (const backend of ["codex", "claude"]) {
  for (const scenario of cases) {
    test(`${backend} post-edit hook checks the written TypeScript: ${scenario.name}`, () => {
      const fixture = mkdtempSync(join(tmpdir(), "hall-dispatch-hook-"));
      try {
        const source = join(fixture, "packages/domain/src/probe.ts");
        mkdirSync(dirname(source), { recursive: true });
        mkdirSync(join(fixture, "scripts"));
        copyFileSync(join(root, ".code-moniker.toml"), join(fixture, ".code-moniker.toml"));
        writeFileSync(source, scenario.source);
        writeFileSync(join(fixture, "scripts/check-exhaustive-dispatch.mjs"), `import ${JSON.stringify(checker)};\n`);
        const result = spawnSync("sh", [join(root, `.${backend}/hooks/code-moniker-check.sh`)], {
          cwd: fixture,
          env: { ...process.env, [`${backend.toUpperCase()}_PROJECT_DIR`]: fixture },
          input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: source, content: scenario.source } }),
          encoding: "utf8",
          timeout: 30_000,
        });
        assert.ifError(result.error);
        assert.equal(result.status, scenario.rejected ? 2 : 0, result.stderr);
        if (scenario.rejected) assert.match(result.stderr, /Switch statements bypass Hall's exhaustive matcher authority/);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  }
}
