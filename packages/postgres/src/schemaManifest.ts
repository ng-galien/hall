import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const schemaManifestPaths = [
  "sql/000-cluster-roles.sql",
  "sql/005-schemas.sql",
  "sql/010-schema-contract.sql",
  "sql/020-call-context.sql",
  "sql/030-audit.sql",
  "sql/directory/000-requirements.sql",
  "sql/directory/001-types.sql",
  "sql/directory/010-model.sql",
  "sql/directory/020-api.sql",
  "sql/document/000-requirements.sql",
  "sql/document/001-types.sql",
  "sql/document/002-error-codes.sql",
  "sql/document/010-model.sql",
  "sql/document/020-rules.sql",
  "sql/document/030-projections.sql",
  "sql/document/040-api.sql",
  "sql/document/050-siren.sql",
  "sql/council/000-requirements.sql",
  "sql/council/001-types.sql",
  "sql/council/002-error-codes.sql",
  "sql/council/005-council-meetings.sql",
  "sql/council/010-meeting-attendance.sql",
  "sql/council/011-meeting-attendance-rules.sql",
  "sql/council/011a-meeting-presence.sql",
  "sql/council/011b-meeting-membership.sql",
  "sql/council/012-meeting-attendance-lifecycle.sql",
  "sql/council/013-council-meeting-rules.sql",
  "sql/council/014-council-meeting-lifecycle.sql",
  "sql/council/015-council-business.sql",
  "sql/council/016-council-agenda-items.sql",
  "sql/council/017-council-agenda-rules.sql",
  "sql/council/018-council-agenda-lifecycle.sql",
  "sql/council/019-council-agenda-actions.sql",
  "sql/council/019a-agenda-freeze.sql",
  "sql/council/019b-agenda-additions.sql",
  "sql/council/020-ballots.sql",
  "sql/council/025-ballot-participation.sql",
  "sql/council/026-agenda-item-recusals.sql",
  "sql/council/027-quorum-observations.sql",
  "sql/council/030-votes.sql",
  "sql/council/031-ballot-non-participation.sql",
  "sql/council/035-ballot-participation-lifecycle.sql",
  "sql/council/037-ballot-rules.sql",
  "sql/council/038-agenda-ballot-lifecycle.sql",
  "sql/council/039-ballot-result-preview.sql",
  "sql/council/040-ballot-lifecycle.sql",
  "sql/council/050-vote-lifecycle.sql",
  "sql/council/055-ballot-actions.sql",
  "sql/council/059-meeting-snapshots.sql",
  "sql/council/060-council-meeting-closure.sql",
  "sql/council/061-minutes.sql",
  "sql/council/069-notice-deadline.sql",
  "sql/council/070-council-meeting-api.sql",
  "sql/council/071-meeting-attendance-api.sql",
  "sql/council/072-ballot-api.sql",
  "sql/council/073-minutes-api.sql",
  "sql/council/074-meeting-closure-api.sql",
  "sql/council/075-meeting-conduct-api.sql",
  "sql/council/076-ballot-result-preview-api.sql",
  "sql/workspace/000-requirements.sql",
  "sql/workspace/002-error-codes.sql",
  "sql/workspace/010-council-business-workspace.sql",
  "sql/workspace/020-council-business-api.sql",
  "sql/workspace/021-council-business-bundles.sql",
  "sql/workspace/025-decision-proposal-workspace.sql",
  "sql/workspace/026-proposal-text-protection.sql",
  "sql/workspace/030-council-agenda-api.sql",
  "sql/workspace/035-meeting-documentary-snapshots.sql",
  "sql/workspace/040-meeting-notices.sql",
  "sql/workspace/045-prepared-council-subjects.sql",
  "sql/workspace/050-council-decision-facts.sql",
  "sql/workspace/051-council-decisions.sql",
  "sql/workspace/052-council-decision-recovery.sql",
  "sql/workspace/053-decision-documentary-context.sql",
  "sql/workspace/054-decision-numbering.sql",
  "sql/workspace/060-meeting-documents.sql",
  "sql/900-grants.sql",
  "sql/directory/030-contact-representations.sql",
] as const;

export type SchemaManifestEntry = Readonly<{
  path: string;
  sql: string;
}>;

export type SchemaManifest = Readonly<{
  entries: readonly SchemaManifestEntry[];
  fingerprint: string;
}>;

export function fingerprintSchemaManifest(entries: readonly SchemaManifestEntry[]): string {
  const hash = createHash("sha256");
  for (const entry of entries) {
    hash.update(entry.path, "utf8");
    hash.update("\0", "utf8");
    hash.update(entry.sql, "utf8");
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

export function defineSchemaManifest(entries: readonly SchemaManifestEntry[]): SchemaManifest {
  return { entries, fingerprint: fingerprintSchemaManifest(entries) };
}

export async function loadSchemaManifest(): Promise<SchemaManifest> {
  const packageRoot = new URL("../", import.meta.url);
  const entries = await Promise.all(
    schemaManifestPaths.map(async (path) => ({
      path,
      sql: await readFile(fileURLToPath(new URL(path, packageRoot)), "utf8"),
    })),
  );
  return defineSchemaManifest(entries);
}
