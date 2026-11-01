import { SchemaContractError } from "@hall/postgres";
import { expect, it } from "vitest";
import { isLocalSchemaFingerprintMismatch } from "../src/core/localServer.js";

const expected = "a".repeat(64);
const different = "b".repeat(64);

// @verifies-requirement HALL-TR-DSK-010
it.each([
  ["a verified different fingerprint", new SchemaContractError("Different schema", expected, different), true],
  ["a missing schema contract", new SchemaContractError("Missing contract", expected, null), false],
  ["a matching fingerprint", new SchemaContractError("Another schema failure", expected, expected), false],
  ["an ordinary error with the same wording", new Error("PostgreSQL schema fingerprint differs"), false],
  ["an unverified object", { expectedFingerprint: expected, actualFingerprint: different }, false],
  ["an unidentified failure", null, false],
])("classifies %s before allowing a fictional demonstration reset", (_description, failure, mismatch) => {
  expect(isLocalSchemaFingerprintMismatch(failure)).toBe(mismatch);
});
