import assert from "node:assert/strict";
import { test } from "vitest";
import { buildPathTree } from "../src/pages/workspace/paths.ts";

// @verifies-requirement HALL-FR-WSP-370
test("navigation index paths include a root sentinel without recursively nesting it", () => {
  const tree = buildPathTree([], [], ["", "Tourisme et loisirs/Tourisme"]);
  assert.deepEqual(tree.map((node) => node.path), ["Tourisme et loisirs"]);
  assert.deepEqual(tree[0].children.map((node) => node.path), ["Tourisme et loisirs/Tourisme"]);
});
