import { describe, expect, it } from "vitest";
import { CADASTRE_PARCEL_ID_PATTERN, cadastreParcelIdsInText, cadastreParcelLabel } from "./cadastreParcel.js";

describe("cadastre parcels", () => {
  // @verifies-requirement HALL-FR-DOC-370
  it("labels a parcel by section and number without leading zeros, with a prefix other than 000", () => {
    expect(cadastreParcelLabel("999990000A0221", { section: "A", numero: "0221", prefixe: "000" })).toBe("A 221");
    expect(cadastreParcelLabel("999990000B0010", null)).toBe("B 10");
    expect(cadastreParcelLabel("99999123AB0007", {})).toBe("123 AB 7");
    expect(cadastreParcelLabel("2A0040000C0100", { section: "0C" })).toBe("C 100");
  });

  // @verifies-requirement HALL-FR-DOC-400
  // @verifies-requirement HALL-FR-DOC-360
  it("requires a letter in the section so that a SIRET is never a parcel", () => {
    expect(CADASTRE_PARCEL_ID_PATTERN.test("999990000A0221")).toBe(true);
    expect(CADASTRE_PARCEL_ID_PATTERN.test("99999000AB0001")).toBe(true);
    expect(CADASTRE_PARCEL_ID_PATTERN.test("2A0040000C0100")).toBe(true);
    expect(CADASTRE_PARCEL_ID_PATTERN.test("12345678900012")).toBe(false);
    expect(cadastreParcelIdsInText("12345678900012 999990000A0221")).toEqual({
      parcelIds: ["999990000A0221"],
      rejected: ["12345678900012"],
    });
  });

  it("reads parcel identifiers from CSV or pasted text and reports the other values", () => {
    expect(
      cadastreParcelIdsInText('idu;libelle\n"999990000A0221";Mairie\n999990000a0222, 999990000A0221\n\n2B0040000C0100'),
    ).toEqual({
      parcelIds: ["999990000A0221", "999990000A0222", "2B0040000C0100"],
      rejected: ["idu", "libelle", "Mairie"],
    });
  });
});
