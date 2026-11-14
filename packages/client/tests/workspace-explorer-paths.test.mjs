import assert from "node:assert/strict";
import { test } from "vitest";
import { explorerFolderPaths } from "../src/pages/workspace/paths.ts";

const folder = (id, path, name) => ({
  id,
  slug: id,
  path,
  name,
  fullPath: path ? `${path}/${name}` : name,
  kind: "folder",
});
const business = { folderPath: "Voirie", title: "Affaire couleur" };
const fullCatalog = [
  folder("voirie", "", "Voirie"),
  folder("business", "Voirie", "Affaire couleur"),
  folder("plans", "Voirie/Affaire couleur", "Plans"),
  folder("travaux", "Voirie", "Travaux"),
];

// @verifies-requirement HALL-FR-WSP-490
test("the folder of a business is never a folder of the explorer, whatever the catalogue holds", () => {
  for (const catalog of [fullCatalog, fullCatalog.slice(0, 2), []]) {
    assert.ok(!explorerFolderPaths(catalog, [business], "").includes("Voirie/Affaire couleur"));
  }
  assert.deepEqual(explorerFolderPaths(fullCatalog, [business], "Voirie"), [
    "Voirie",
    "Voirie/Affaire couleur/Plans",
    "Voirie/Travaux",
  ]);
});
