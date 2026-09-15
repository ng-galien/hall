import {
  type CatalogQueryClient,
  type CodeMonikerStructureComparisonClient,
  comparePostgresStructures,
  type PostgresCatalogModel,
  type PostgresStructureComparison,
  readPostgresCatalog,
  type VirtualSqlDocument,
} from "@ng-galien/postgresql-catalog";
import type { SchemaManifest } from "./schemaManifest.js";

const HALL_SCHEMAS = new Set(["hall", "hall_api", "hall_meta"]);

export type HallSchemaComparisonName = "manifest-to-materialized-target" | "installed-to-target" | "upgraded-to-target";

export interface HallSchemaComparisonVerdict {
  name: HallSchemaComparisonName;
  comparison: PostgresStructureComparison;
}

export interface HallSchemaInspection {
  targetCatalog: PostgresCatalogModel;
  installedCatalog: PostgresCatalogModel;
  targetDocuments: VirtualSqlDocument[];
  installedDocuments: VirtualSqlDocument[];
  verdicts: [HallSchemaComparisonVerdict, HallSchemaComparisonVerdict];
}

const CAPABILITY_PROBE_BASE: VirtualSqlDocument[] = [
  {
    uri: "hall-schema-upgrade://capability-probe.sql",
    language: "sql",
    content: `
CREATE TABLE hall.capability_probe (
  id bigint PRIMARY KEY,
  note text NULL
);
ALTER TABLE hall.capability_probe ADD COLUMN value text;
COMMENT ON COLUMN hall.capability_probe.value IS '@hall renamed-from old_value';
CREATE INDEX capability_probe_value_idx ON hall.capability_probe (value);
`,
  },
];

const CAPABILITY_PROBE_HEAD: VirtualSqlDocument[] = [
  {
    uri: "hall-schema-upgrade://capability-probe.sql",
    language: "sql",
    content: `
CREATE TABLE hall.capability_probe (
  id bigint NOT NULL,
  note text,
  value text,
  CONSTRAINT capability_probe_pkey PRIMARY KEY (id)
);
COMMENT ON COLUMN hall.capability_probe.value IS '@hall renamed-from old_value';
CREATE INDEX capability_probe_value_idx ON hall.capability_probe USING btree (value);
`,
  },
];

export async function assertHallSchemaUpgradeCodeMoniker(
  codeMoniker: CodeMonikerStructureComparisonClient,
): Promise<void> {
  const comparison = await comparePostgresStructures(
    codeMoniker,
    CAPABILITY_PROBE_BASE,
    CAPABILITY_PROBE_HEAD,
    "hall-schema-upgrade-capability-probe",
    "structure",
  );
  if (!comparison.isomorphic) {
    throw new Error(
      "The Code Moniker runtime cannot compare Hall PostgreSQL schemas reliably. Install a runtime with sequential ALTER TABLE, constraint signatures, column comments, and index ownership support, or set CODE_MONIKER_BINARY to that executable.",
    );
  }
}

export async function inspectHallSchemaUpgrade(
  codeMoniker: CodeMonikerStructureComparisonClient,
  installed: CatalogQueryClient,
  target: CatalogQueryClient,
  manifest: SchemaManifest,
): Promise<HallSchemaInspection> {
  const [installedSnapshot, targetSnapshot] = await Promise.all([
    readPostgresCatalog(installed, { connectionId: "hall-installed", database: "hall" }),
    readPostgresCatalog(target, { connectionId: "hall-target", database: "hall" }),
  ]);
  const targetDocuments = hallCatalogDocuments(targetSnapshot.sourceSet.documents);
  const installedDocuments = hallCatalogDocuments(installedSnapshot.sourceSet.documents);
  const manifestComparison = await comparePostgresStructures(
    codeMoniker,
    hallManifestDocuments(manifest),
    targetDocuments,
    "manifest..materialized-target",
    "structure",
  );
  const installedComparison = await comparePostgresStructures(
    codeMoniker,
    installedDocuments,
    targetDocuments,
    "installed..target",
  );
  return {
    targetCatalog: targetSnapshot.catalog,
    installedCatalog: installedSnapshot.catalog,
    targetDocuments,
    installedDocuments,
    verdicts: [
      { name: "manifest-to-materialized-target", comparison: manifestComparison },
      { name: "installed-to-target", comparison: installedComparison },
    ],
  };
}

export async function verifyUpgradedHallSchema(
  codeMoniker: CodeMonikerStructureComparisonClient,
  upgraded: CatalogQueryClient,
  targetDocuments: readonly VirtualSqlDocument[],
): Promise<HallSchemaComparisonVerdict> {
  const upgradedSnapshot = await readPostgresCatalog(upgraded, {
    connectionId: "hall-upgraded",
    database: "hall",
  });
  const comparison = await comparePostgresStructures(
    codeMoniker,
    hallCatalogDocuments(upgradedSnapshot.sourceSet.documents),
    targetDocuments,
    "upgraded..target",
  );
  return { name: "upgraded-to-target", comparison };
}

export function hallManifestDocuments(manifest: SchemaManifest): VirtualSqlDocument[] {
  return [
    {
      uri: "hall-manifest://schema.sql",
      language: "sql",
      content: manifest.entries
        .map((entry) => entry.sql.trim())
        .filter(Boolean)
        .join("\n\n")
        .concat("\n"),
    },
  ];
}

export function hallCatalogDocuments(documents: readonly VirtualSqlDocument[]): VirtualSqlDocument[] {
  return documents.filter((document) => document.postgres && HALL_SCHEMAS.has(document.postgres.schema));
}
