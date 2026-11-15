import assert from "node:assert/strict";
import { test } from "vitest";
import { buildPathTree } from "../src/pages/workspace/paths.ts";

// @verifies-requirement HALL-FR-WSP-370
test("navigation index paths include a root sentinel without recursively nesting it", () => {
  const tree = buildPathTree([], [], ["", "Tourisme et loisirs/Tourisme"]);
  assert.deepEqual(
    tree.map((node) => node.path),
    ["Tourisme et loisirs"],
  );
  assert.deepEqual(
    tree[0].children.map((node) => node.path),
    ["Tourisme et loisirs/Tourisme"],
  );
});

// @verifies-requirement HALL-FR-WSP-500
test("under each folder of the tree, the sub-folders come before the affaires, each by name", () => {
  const folder = (id, path, name) => ({
    id,
    slug: id,
    path,
    name,
    fullPath: path ? `${path}/${name}` : name,
    kind: "folder",
  });
  const catalog = [
    folder("voirie", "", "Voirie"),
    folder("zone", "Voirie", "Zone 10"),
    folder("zone2", "Voirie", "zone 2"),
    folder("affaire-b", "Voirie", "Bornes"),
    folder("affaire-e", "Voirie", "Éclairage"),
  ];
  const businesses = [
    { id: "e", folderResourceId: "affaire-e", folderPath: "Voirie", title: "Éclairage" },
    { id: "b", folderResourceId: "affaire-b", folderPath: "Voirie", title: "Bornes" },
  ];
  for (const arrival of [businesses, [...businesses].reverse()]) {
    const [voirie] = buildPathTree(arrival, [...catalog].reverse());
    assert.deepEqual(
      voirie.children.map((node) => node.name),
      ["zone 2", "Zone 10", "Bornes", "Éclairage"],
    );
  }
});
