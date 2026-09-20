import assert from "node:assert/strict";
import { test } from "vitest";
import { matchingCommitteeCandidates } from "../src/features/council-business/committeeSearch.ts";

// @verifies-requirement HALL-FR-BUS-070
test("committee search exposes several unlinked results and ignores accents", () => {
  const candidates = [
    { id: "one", name: "Commission Écoles" },
    { id: "two", name: "Commission écoles et jeunesse" },
    { id: "three", name: "Commission finances" },
  ];
  const links = [
    { committeeId: "one", name: candidates[0].name, archivedAt: null, href: "/api/council-committees/one" },
  ];
  assert.deepEqual(
    matchingCommitteeCandidates(candidates, links, "ECOLES").map(({ id }) => id),
    ["two"],
  );
  assert.deepEqual(
    matchingCommitteeCandidates(candidates, [], "commission").map(({ id }) => id),
    ["one", "two", "three"],
  );
});
