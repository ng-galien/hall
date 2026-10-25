import assert from "node:assert/strict";
import { test } from "vitest";
import { interpolateMessage, pluralMessage } from "../src/i18n/messageFormat.ts";

test("interpolates repeated values literally and preserves missing parameters", () => {
  assert.equal(interpolateMessage("{name} · {name} · {count}", { name: "$&", count: 0 }), "$& · $& · 0");
  assert.equal(interpolateMessage("{missing}"), "{missing}");
});
test("uses locale plural rules, including French zero and English zero", () => {
  assert.equal(pluralMessage("fr-FR", 0, "{count} point", "{count} points"), "0 point");
  assert.equal(pluralMessage("en-GB", 0, "{count} item", "{count} items"), "0 items");
  assert.equal(pluralMessage("fr-FR", 2, "{count} point", "{count} points"), "2 points");
});
