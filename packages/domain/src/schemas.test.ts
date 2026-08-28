import { describe, expect, it } from "vitest";
import { recordAttendanceSchema, recordBallotSchema, updateHallSettingsSchema } from "./schemas.js";

describe("updateHallSettingsSchema", () => {
  const settings = {
    name: "Saint-Aubin",
    inseeCode: "12345",
    siren: "123456789",
    population: 2_500,
    populationReferenceDate: "2026-01-01",
    addressLine1: "1 place de la Mairie",
    addressLine2: "",
    postalCode: "12345",
    city: "Saint-Aubin",
    phone: "+33 1 23 45 67 89",
    email: "contact@saint-aubin.fr",
    website: "https://saint-aubin.fr",
    defaultMeetingLocation: "Salle du conseil",
    timeZone: "Europe/Paris",
    outboundEmailSenderName: "Conseil municipal de Saint-Aubin",
    outboundEmailSenderAddress: "conseil@saint-aubin.fr",
    outboundEmailReplyToAddress: "secretariat@saint-aubin.fr",
  };

  it("accepts a complete Hall configuration", () => {
    expect(updateHallSettingsSchema.parse(settings)).toEqual(settings);
  });

  it("rejects invalid institutional identifiers and time zones", () => {
    expect(() => updateHallSettingsSchema.parse({ ...settings, inseeCode: "1234" })).toThrow();
    expect(() => updateHallSettingsSchema.parse({ ...settings, timeZone: "Paris" })).toThrow();
  });

  it("accepts Corsican INSEE codes", () => {
    expect(updateHallSettingsSchema.parse({ ...settings, inseeCode: "2A004" }).inseeCode).toBe("2A004");
    expect(updateHallSettingsSchema.parse({ ...settings, inseeCode: "2B033" }).inseeCode).toBe("2B033");
  });

  it("rejects non-web website protocols", () => {
    expect(() => updateHallSettingsSchema.parse({ ...settings, website: "javascript:alert(1)" })).toThrow();
    expect(() => updateHallSettingsSchema.parse({ ...settings, website: "ftp://saint-aubin.fr" })).toThrow();
  });
});

describe("recordBallotSchema", () => {
  it("keeps named votes for a public ballot", () => {
    const memberId = "11111111-1111-4111-8111-111111111111";
    const result = recordBallotSchema.parse({
      method: "public",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      councilDecisionId: "22222222-2222-4222-8222-222222222222",
      votes: [{ memberId, castByMemberId: memberId, choice: "for" }],
    });
    expect(result.method).toBe("public");
  });

  it("keeps only totals for a secret ballot", () => {
    const result = recordBallotSchema.parse({
      method: "secret",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      councilDecisionId: "22222222-2222-4222-8222-222222222222",
      totals: { votesFor: 5, votesAgainst: 2, abstentions: 1 },
    });
    expect(result).toMatchObject({ method: "secret", totals: { notVoting: 0 } });
  });
});

describe("meeting command schemas", () => {
  it("requires both the holder and document for a represented member", () => {
    expect(() =>
      recordAttendanceSchema.parse({
        memberId: "11111111-1111-4111-8111-111111111111",
        status: "represented",
        proxyHolderMemberId: "22222222-2222-4222-8222-222222222222",
        proxyDocumentId: null,
      }),
    ).toThrow();
  });
});
