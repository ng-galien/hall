import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const callRule = "shape.callable.client.search-projection-calls-presentation-authority";
const dependencyRule = "refs.client.search-projection-consumes-presentation-decision-only";
const delegated = `
import { preferredResourcePresentation } from "@hall/templating";
export function resourceMentionable(resource) {
  return { resourcePresentation: preferredResourcePresentation(resource) };
}
`;

// @verifies-requirement HALL-FR-SRC-030
const scenarios = [
  { name: "accepts delegation to the existing presentation authority", source: delegated, rejectedBy: [] },
  {
    name: "rejects a local policy replacing the authority even without an imported type",
    source: `
function preferredDocumentaryPresentation(resource) {
  return resource.mediaType === "application/pdf" ? "document" : "image";
}
export function resourceMentionable(resource) {
  return { resourcePresentation: preferredDocumentaryPresentation(resource) };
}
`,
    rejectedBy: [callRule],
  },
  {
    name: "rejects the previous typed duplicate even when the canonical call is retained",
    source: `${delegated}
import type { ResourcePresentationKind } from "@hall/templating";
function preferredDocumentaryPresentation(resource): ResourcePresentationKind {
  return resource.mediaType === "application/pdf" ? "document" : "image";
}
`,
    rejectedBy: [dependencyRule],
  },
];

for (const scenario of scenarios) {
  test(`HALL-FR-SRC-030 architecture: ${scenario.name}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "hall-search-authority-"));
    try {
      const sourcePath = join(fixture, "packages/client/src/hooks/useReferenceMentionables.ts");
      mkdirSync(dirname(sourcePath), { recursive: true });
      copyFileSync(join(root, ".code-moniker.toml"), join(fixture, ".code-moniker.toml"));
      copyFileSync(
        join(root, "packages/client/code-moniker.fragment.toml"),
        join(fixture, "packages/client/code-moniker.fragment.toml"),
      );
      writeFileSync(sourcePath, scenario.source);
      const result = spawnSync("code-moniker", ["check", "."], { cwd: fixture, encoding: "utf8", timeout: 30_000 });
      assert.ifError(result.error);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, scenario.rejectedBy.length ? 1 : 0, output);
      for (const rule of scenario.rejectedBy) assert.ok(output.includes(rule), output);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
