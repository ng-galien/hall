import assert from "node:assert/strict";
import { test } from "vitest";
import { photoReduction, reducePhoto, reducePhotoOfForm } from "../src/features/documents/photoReduction.ts";

/** A decoder that reports the given size and records how the photo is drawn and encoded. */
function decoder({ width, height, opaque = true, fails = false }) {
  const calls = { decoded: 0, drawn: null, quality: null, closed: 0 };
  const decode = async () => {
    calls.decoded += 1;
    if (fails) throw new Error("undecodable");
    return {
      width,
      height,
      draw(drawnWidth, drawnHeight) {
        calls.drawn = [drawnWidth, drawnHeight];
        return {
          opaque: () => opaque,
          jpeg: async (quality) => {
            calls.quality = quality;
            return new Blob([new Uint8Array(1000)], { type: "image/jpeg" });
          },
        };
      },
      close: () => {
        calls.closed += 1;
      },
    };
  };
  return { decode, calls };
}

const file = (name, type, bytes) => new File([new Uint8Array(bytes)], name, { type });

test("the bounds of a photo are written once: 2000 pixels on the longest side, JPEG quality 0.8, 500 kB", () => {
  assert.deepEqual(photoReduction, { longestSide: 2000, jpegQuality: 0.8, keptBelowBytes: 500_000 });
});

// @verifies-requirement HALL-FR-LAY-010
test("a 12-megapixel photo is brought down to 2000 pixels on its longest side and encoded as JPEG 0.8", async () => {
  const { decode, calls } = decoder({ width: 4032, height: 3024 });
  const photo = file("IMG_2041.jpg", "image/jpeg", 4_000_000);
  const reduced = await reducePhoto(photo, decode);
  assert.deepEqual(calls.drawn, [2000, 1500]);
  assert.equal(calls.quality, 0.8);
  assert.equal(reduced.type, "image/jpeg");
  assert.equal(reduced.name, "IMG_2041.jpg");
  assert.equal(reduced.size, 1000);
  assert.equal(calls.closed, 1);
});

// @verifies-requirement HALL-FR-LAY-010
test("a photo taken upright keeps the proportions given by its orientation", async () => {
  const { decode, calls } = decoder({ width: 3024, height: 4032 });
  await reducePhoto(file("upright.jpeg", "image/jpeg", 3_000_000), decode);
  assert.deepEqual(calls.drawn, [1500, 2000]);
});

// @verifies-requirement HALL-FR-LAY-010
test("an image within 2000 pixels and under 500 kB is sent as it is", async () => {
  const { decode, calls } = decoder({ width: 1600, height: 1200 });
  const photo = file("small.jpg", "image/jpeg", 400_000);
  assert.equal(await reducePhoto(photo, decode), photo);
  assert.equal(calls.drawn, null);
});

test("an image within 2000 pixels but heavier than 500 kB is encoded again at its own size", async () => {
  const { decode, calls } = decoder({ width: 1800, height: 1200 });
  const reduced = await reducePhoto(file("heavy.jpg", "image/jpeg", 900_000), decode);
  assert.deepEqual(calls.drawn, [1800, 1200]);
  assert.equal(reduced.size, 1000);
});

test("an opaque PNG photo becomes a JPEG file named .jpg", async () => {
  const { decode } = decoder({ width: 3000, height: 2000 });
  const reduced = await reducePhoto(file("Capture.png", "image/png", 6_000_000), decode);
  assert.equal(reduced.type, "image/jpeg");
  assert.equal(reduced.name, "Capture.jpg");
});

// @verifies-requirement HALL-FR-LAY-010
test("an image with a transparent pixel, such as a logo, is sent as it is", async () => {
  const { decode } = decoder({ width: 3000, height: 2000, opaque: false });
  const logo = file("logo.png", "image/png", 2_000_000);
  assert.equal(await reducePhoto(logo, decode), logo);
});

// @verifies-requirement HALL-FR-LAY-010
test("a file that is not a photo is never decoded", async () => {
  const { decode, calls } = decoder({ width: 5000, height: 5000 });
  for (const other of [
    file("plan.pdf", "application/pdf", 3_000_000),
    file("blason.svg", "image/svg+xml", 3_000_000),
    file("anim.gif", "image/gif", 3_000_000),
  ]) {
    assert.equal(await reducePhoto(other, decode), other);
  }
  assert.equal(calls.decoded, 0);
});

// @verifies-requirement HALL-FR-LAY-010
test("an image the browser cannot decode is sent as it is", async () => {
  const { decode } = decoder({ width: 0, height: 0, fails: true });
  const photo = file("IMG_0001.heic", "image/heic", 3_000_000);
  assert.equal(await reducePhoto(photo, decode), photo);
});

test("an upload form carries the reduced photo, and its name when the name was the file's", async () => {
  const { decode } = decoder({ width: 4000, height: 3000 });
  const named = new FormData();
  named.set("name", "Photo du 2026-11-14 10-00-00.png");
  named.set("file", file("Photo du 2026-11-14 10-00-00.png", "image/png", 5_000_000));
  await reducePhotoOfForm(named, decode);
  assert.equal(named.get("name"), "Photo du 2026-11-14 10-00-00.jpg");
  assert.equal(named.get("file").type, "image/jpeg");
  assert.equal(named.get("file").name, "Photo du 2026-11-14 10-00-00.jpg");

  const titled = new FormData();
  titled.set("title", "Balance du tacot");
  titled.set("file", file("IMG_2041.png", "image/png", 5_000_000));
  await reducePhotoOfForm(titled, decode);
  assert.equal(titled.get("title"), "Balance du tacot");
  assert.equal(titled.get("name"), null);
});
