import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import {
  geographicPropertyText,
  municipalFilterLayerIds,
  orderedGeographicProperties,
} from "../src/features/geographic/geographicFeatureCardModel.ts";

const read = (path) => readFileSync(join(import.meta.dirname, "..", path), "utf8");

// @verifies-requirement HALL-FR-DOC-380
test("the card shows scalar properties as text and nested values as JSON", () => {
  assert.equal(geographicPropertyText("A"), "A");
  assert.equal(geographicPropertyText(6865), "6865");
  assert.equal(geographicPropertyText(false), "false");
  assert.equal(geographicPropertyText(null), "");
  assert.equal(geographicPropertyText({ owner: { kind: "commune" } }), '{"owner":{"kind":"commune"}}');
});

// @verifies-requirement HALL-FR-DOC-400
test("the municipal filter is offered for cadastre layers once the commune's list exists", () => {
  const keys = {
    parcels: { kind: "cadastreParcel", property: "id" },
    markers: { kind: "sourceId" },
    plain: { kind: "none" },
  };
  assert.deepEqual([...municipalFilterLayerIds(keys, 0)], []);
  assert.deepEqual([...municipalFilterLayerIds(keys, 12)], ["parcels"]);
});

// @verifies-requirement HALL-FR-DOC-380
test("the card lists Etalab parcel properties in file order, unknown keys last", () => {
  const properties = {
    section: "A",
    contenance: 6865,
    id: "999990000A0221",
    numero: "0221",
    extra: true,
    commune: "99999",
  };
  const order = ["id", "commune", "prefixe", "section", "numero", "contenance"];
  assert.deepEqual(
    orderedGeographicProperties(properties, order).map(([key]) => key),
    ["id", "commune", "section", "numero", "contenance", "extra"],
  );
  assert.deepEqual(
    orderedGeographicProperties({ b: 1, a: 2 }, []).map(([key]) => key),
    ["b", "a"],
  );
});

// @verifies-requirement HALL-FR-DOC-230
test("image upload is offered only with the collection action and the text's own update action", () => {
  const store = read("src/stores/workspaceResourcesStore.ts");
  const body = read("src/features/resources/ResourcePresentationBody.tsx");
  assert.match(
    store,
    /createEditorAsset: Boolean\(findSirenAction\(representation, "resource\.create-editor-asset"\)\)/,
  );
  assert.match(body, /onUploadImage=\{canUploadImage && capabilities\.updateContent \? onUploadImage : undefined\}/);
});
