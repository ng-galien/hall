import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { readRuntimeSelection, resolveRuntimeSelection } from "../../scripts/development/runtime-selection.mjs";

test("preserves the selected database and refuses an unknown or missing selection before restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "hall-runtime-selection-"));
  try {
    const first = join(directory, "first.json"),
      second = join(directory, "second.json"),
      state = join(directory, "state.json");
    writeFileSync(first, "{}");
    writeFileSync(second, "{}");
    const resolve = (overrides = {}) =>
      resolveRuntimeSelection({
        explicit: false,
        requested: null,
        recorded: readRuntimeSelection(state),
        required: true,
        ...overrides,
      });
    assert.throws(() => resolve(), /unknown/);
    writeFileSync(state, JSON.stringify({ runtimeConfig: first }));
    assert.equal(resolve(), first);
    assert.equal(resolve({ explicit: true, requested: second }), second);
    rmSync(first);
    assert.throws(() => resolve(), /missing/);
    writeFileSync(state, JSON.stringify({ runtimeConfig: null }));
    assert.equal(resolve(), null);
    writeFileSync(state, "{}");
    assert.throws(() => resolve(), /Invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
