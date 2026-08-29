import assert from "node:assert/strict";
import test from "node:test";
import { formatPhoneNumber, phoneHref } from "../src/features/council-members/phonePresentation.ts";

test("French local phone numbers are grouped for presentation", () => {
  assert.equal(formatPhoneNumber("0612345678"), "06 12 34 56 78");
  assert.equal(formatPhoneNumber("06.12.34.56.78"), "06 12 34 56 78");
});

test("French international phone numbers preserve their country prefix", () => {
  assert.equal(formatPhoneNumber("+33612345678"), "+33 6 12 34 56 78");
});

test("unknown phone formats are displayed without rewriting them", () => {
  assert.equal(formatPhoneNumber("extension 482"), "extension 482");
});

test("telephone links remove common presentation separators", () => {
  assert.equal(phoneHref("+33 (0)6 12-34.56.78"), "tel:+330612345678");
});
