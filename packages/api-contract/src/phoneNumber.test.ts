import { describe, expect, it } from "vitest";
import { contactSchema, formatPhoneNumber, normalizePhoneNumber, saveContactSchema } from "./index.js";

const identity = { firstName: "Alice", lastName: "Martin" };

// @verifies-requirement HALL-FR-DIR-170
describe("contact telephone numbers", () => {
  it("stores a French number in one form whatever its separators or prefix", () => {
    for (const typed of [
      "0786295576",
      "07 86 29 55 76",
      "07.86.29.55.76",
      "07-86-29-55-76",
      "+33 7 86 29 55 76",
      "+33786295576",
      "+33 (0)7 86 29 55 76",
      " 07 86 29 55 76 ",
    ]) {
      expect(normalizePhoneNumber(typed), typed).toBe("+33786295576");
    }
  });

  it("keeps a foreign number typed in international format", () => {
    expect(normalizePhoneNumber("+41 22 123 45 67")).toBe("+41221234567");
    expect(normalizePhoneNumber("+1 (202) 555-0143")).toBe("+12025550143");
  });

  it("refuses a text that is not a telephone number", () => {
    for (const typed of [
      "07 86 29 55",
      "7 86 29 55 76",
      "00 86 29 55 76",
      "03 84 87 42 31 / 07 86 29 55 76",
      "+33 7 86 29 55 7",
      "0041 22 123 45 67",
      "+0 22 123 45 67",
      "mairie",
    ]) {
      expect(normalizePhoneNumber(typed), typed).toBeNull();
    }
  });

  it("shows a French number in pairs of digits and another number as stored", () => {
    expect(formatPhoneNumber("+33786295576")).toBe("07 86 29 55 76");
    expect(formatPhoneNumber("+33384874231")).toBe("03 84 87 42 31");
    expect(formatPhoneNumber("+41221234567")).toBe("+41221234567");
  });

  it("saves three optional numbers in their stored form and rejects an invalid one", () => {
    expect(
      saveContactSchema.parse({
        ...identity,
        mobilePhone: "07 86 29 55 76",
        personalPhone: "",
        professionalPhone: "03.84.87.42.31",
      }),
    ).toMatchObject({ mobilePhone: "+33786295576", personalPhone: null, professionalPhone: "+33384874231" });
    expect(saveContactSchema.parse(identity)).toMatchObject({
      mobilePhone: null,
      personalPhone: null,
      professionalPhone: null,
    });
    const refused = saveContactSchema.safeParse({ ...identity, personalPhone: "03 84 87 42" });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.map((issue) => issue.path.join("."))).toEqual(["personalPhone"]);
  });

  it("no longer carries a single free-text telephone field", () => {
    expect(saveContactSchema.safeParse({ ...identity, phone: "07 86 29 55 76" }).success).toBe(false);
    expect(Object.keys(contactSchema.shape)).not.toContain("phone");
  });
});
