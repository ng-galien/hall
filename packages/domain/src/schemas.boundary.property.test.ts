import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { attendanceStatuses } from "./model.js";
import {
  geographicViewSchema,
  recordAttendanceSchema,
  recordBallotSchema,
  resourceIdsSchema,
  resourceTagsSchema,
} from "./schemas.js";

const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const councilDecisionId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";

const totalsArbitrary = fc.record({
  votesFor: fc.nat({ max: 1_000 }),
  votesAgainst: fc.nat({ max: 1_000 }),
  abstentions: fc.nat({ max: 1_000 }),
  notVoting: fc.nat({ max: 1_000 }),
});

const votesArbitrary = fc
  .uniqueArray(fc.record({ memberId: fc.uuid(), choice: fc.constantFrom("for", "against", "abstain", "notVoting") }), {
    minLength: 1,
    maxLength: 20,
    selector: ({ memberId: generatedMemberId }) => generatedMemberId,
  })
  .map((votes) => votes.map((vote) => ({ ...vote, castByMemberId: vote.memberId })));

const finiteCoordinateArbitrary = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(-181, -180, -90, 0, 90, 180, 181),
);

describe("HTTP schema boundary properties", () => {
  it("accepts generated ballots containing only the fields of their method", () => {
    fc.assert(
      fc.property(fc.constantFrom("public", "secret"), votesArbitrary, totalsArbitrary, (method, votes, totals) => {
        const payload =
          method === "public"
            ? { method, idempotencyKey, councilDecisionId, votes }
            : { method, idempotencyKey, councilDecisionId, totals };

        expect(recordBallotSchema.safeParse(payload).success).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("rejects generated ballots containing fields from the other method", () => {
    fc.assert(
      fc.property(fc.constantFrom("public", "secret"), votesArbitrary, totalsArbitrary, (method, votes, totals) => {
        const contradictoryPayload = { method, idempotencyKey, councilDecisionId, votes, totals };

        expect(recordBallotSchema.safeParse(contradictoryPayload).success).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it("accepts attendance proxy metadata exactly for represented members", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...attendanceStatuses),
        fc.boolean(),
        fc.boolean(),
        (status, hasProxyHolder, hasProxyDocument) => {
          const payload = {
            memberId,
            status,
            proxyHolderMemberId: hasProxyHolder ? councilDecisionId : null,
            proxyDocumentId: hasProxyDocument ? idempotencyKey : null,
          };
          const expectedToSucceed =
            status === "represented" ? hasProxyHolder && hasProxyDocument : !hasProxyHolder && !hasProxyDocument;

          expect(recordAttendanceSchema.safeParse(payload).success).toBe(expectedToSucceed);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("accepts generated map centers exactly inside geographic bounds", () => {
    fc.assert(
      fc.property(finiteCoordinateArbitrary, finiteCoordinateArbitrary, (longitude, latitude) => {
        const expectedToSucceed = longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;

        expect(
          geographicViewSchema.safeParse({ kind: "center", center: [longitude, latitude], zoom: 12 }).success,
        ).toBe(expectedToSucceed);
      }),
      { numRuns: 1_000 },
    );
  });

  it("keeps identifier and tag collections stable under duplication", () => {
    const tagArbitrary = fc.constantFrom(" Budget ", "RAPPORT", "délibération", "Séance", "annexe-1");
    fc.assert(
      fc.property(fc.array(fc.uuid(), { maxLength: 50 }), fc.array(tagArbitrary, { maxLength: 25 }), (ids, tags) => {
        expect(resourceIdsSchema.parse(ids.concat(ids))).toEqual([...new Set(ids)]);

        const normalizedTags = [...new Set(tags.map((tag) => tag.trim().toLocaleLowerCase("fr-FR")))].sort();
        expect(resourceTagsSchema.parse(tags.concat(tags))).toEqual(normalizedTags);
      }),
      { numRuns: 1_000 },
    );
  });
});
