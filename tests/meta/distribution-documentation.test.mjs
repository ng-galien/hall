import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("distribution documentation", () => {
  it("keeps local documentation links resolvable", () => {
    for (const path of [
      "README.md",
      "docs/README.md",
      "docs/runtime.md",
      "docs/distribution.md",
      "docs/municipal-bootstrap.md",
      "docs/trust.md",
    ]) {
      const source = readFileSync(path, "utf8");
      for (const [, target] of source.matchAll(/\]\(([^)]+)\)/g)) {
        if (/^(https?:|#)/.test(target)) continue;
        expect(existsSync(resolve(dirname(path), target.split("#")[0])), `${path}: ${target}`).toBe(true);
      }
    }
  });
});
