import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { readRequirementsView, updateRequirementTheme } from "../../scripts/development/requirements-ui.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hall-requirements-ui-"));
  mkdirSync(join(root, "requirements"), { recursive: true });
  mkdirSync(join(root, "packages/server/src"), { recursive: true });
  mkdirSync(join(root, "backlog"), { recursive: true });
  const catalog = {
    schemaVersion: 2,
    taxonomy: {
      themes: {
        calendar: { label: "Calendrier", description: "Rendez-vous" },
        meetings: { label: "Séances", description: "Séances du conseil" },
      },
      prefixThemes: { CAL: "calendar" },
      requirementThemes: {},
    },
    sources: {},
    requirements: {
      "HALL-FR-CAL-010": {
        name: "CALENDAR_VIEW",
        nature: "functional",
        lifecycle: { state: "accepted", since: "2026-09-12" },
        statement: "Le calendrier est consultable.",
        acceptanceCriteria: ["La vue est affichée."],
        clauses: [{ key: "view", origin: "product", statement: "Hall affiche le calendrier.", sourceIds: [] }],
      },
    },
  };
  writeFileSync(join(root, "requirements/catalog.json"), JSON.stringify(catalog));
  writeFileSync(join(root, "packages/server/src/calendar.ts"), "// @implements-requirement HALL-FR-CAL-010\n");
  writeFileSync(join(root, "backlog/backlog.md"), "<!-- @tracks-requirement HALL-FR-CAL-010 -->\n");
  return root;
}

test("builds the UI view from the canonical catalog and discovered evidence", async () => {
  const root = fixture();
  try {
    const view = await readRequirementsView(root);
    assert.equal(view.summary.requirements, 1);
    assert.equal(view.summary.implemented, 1);
    assert.equal(view.summary.tracked, 1);
    assert.equal(view.requirements[0].theme, "calendar");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("persists explicit theme overrides and removes redundant overrides", async () => {
  const root = fixture();
  try {
    assert.deepEqual(await updateRequirementTheme(root, "HALL-FR-CAL-010", "meetings"), {
      id: "HALL-FR-CAL-010",
      theme: "meetings",
      overridden: true,
    });
    let catalog = JSON.parse(readFileSync(join(root, "requirements/catalog.json"), "utf8"));
    assert.equal(catalog.taxonomy.requirementThemes["HALL-FR-CAL-010"], "meetings");
    await updateRequirementTheme(root, "HALL-FR-CAL-010", "calendar");
    catalog = JSON.parse(readFileSync(join(root, "requirements/catalog.json"), "utf8"));
    assert.equal(catalog.taxonomy.requirementThemes["HALL-FR-CAL-010"], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
