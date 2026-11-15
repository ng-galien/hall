import assert from "node:assert/strict";
import { test } from "vitest";
import { deviceFileDate, isDeviceFileName, readablePhotoName } from "../src/components/editor/photoName.ts";

const words = {
  day: (date) => `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`,
  hour: (date) => `${date.getHours()} h ${String(date.getMinutes()).padStart(2, "0")}`,
  name: (day) => `Photo du ${day}`,
  nameAt: (day, hour) => `Photo du ${day} à ${hour}`,
};

// @verifies-requirement HALL-FR-LAY-010
test("a name given by a device is recognised, a name given by a person is not", () => {
  for (const name of [
    "1000012345.jpg",
    "1731681234567.jpg",
    "image.jpg",
    "IMG_1234.JPG",
    "IMG_20261115_143212.jpg",
    "PXL_20261115_143212345.MP.jpg",
    "DSC01234.JPG",
    "3f2b8c1e-9d4a-4b7e-8f1a-2c3d4e5f6a7b.png",
    "Screenshot_20261115-143212.png",
  ])
    assert.equal(isDeviceFileName(name), true, name);
  for (const name of ["Façade de la mairie.jpg", "photo-mairie.jpg", "Plan du lavoir.png", "Réunion 2026.jpg"])
    assert.equal(isDeviceFileName(name), false, name);
});

// @verifies-requirement HALL-FR-LAY-010
test("a device photo takes the name of its day, with its hour only when that day is already taken in the text", () => {
  const moment = new Date(2026, 10, 15, 14, 32);
  assert.equal(readablePhotoName("1000012345.jpg", moment, [], words), "Photo du 15/11/2026");
  assert.equal(
    readablePhotoName("1000012346.jpg", moment, ["Photo du 15/11/2026"], words),
    "Photo du 15/11/2026 à 14 h 32",
  );
  assert.equal(readablePhotoName("IMG_20250704_091500.jpg", moment, [], words), "Photo du 4/7/2025");
  assert.equal(readablePhotoName("Façade de la mairie.jpg", moment, [], words), "Façade de la mairie");
  assert.equal(deviceFileDate("1000012345.jpg"), null);
});
