import assert from "node:assert/strict";
import { test } from "vitest";
import {
  completeGeographicLayers,
  reorderGeographicLayers,
  setGeographicLayerVisibility,
} from "../src/features/geographic/geographicMapModel.ts";

test("missing base layers are completed without changing stored layer order", () => {
  const layers = [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 0.7 }];
  const completed = completeGeographicLayers(layers);
  assert.deepEqual(completed[0], layers[0]);
  assert.ok(completed.length > layers.length);
  assert.equal(new Set(completed.map(({ id }) => id)).size, completed.length);
});

test("the last visible base layer cannot be hidden", () => {
  const layers = [
    { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 },
    { id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: false, opacity: 1 },
  ];
  assert.deepEqual(setGeographicLayerVisibility(layers, "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", false), layers);
  assert.equal(setGeographicLayerVisibility(layers, "ORTHOIMAGERY.ORTHOPHOTOS", true)[1]?.visible, true);
});

test("reordering follows the displayed top-to-bottom layer order", () => {
  const layers = [
    { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 },
    { id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: true, opacity: 1 },
    { id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS", visible: true, opacity: 1 },
  ];
  const reordered = reorderGeographicLayers(
    layers,
    "CADASTRALPARCELS.PARCELLAIRE_EXPRESS",
    "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
  );
  assert.deepEqual(
    reordered.map(({ id }) => id),
    ["CADASTRALPARCELS.PARCELLAIRE_EXPRESS", "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "ORTHOIMAGERY.ORTHOPHOTOS"],
  );
});
