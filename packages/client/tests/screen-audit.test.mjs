import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { unityFindings } from "../e2e/screen-audit/engine/conformance.mjs";
import {
  groupFindings,
  intervalLabel,
  intervalsOf,
  parseRanges,
  planWidths,
} from "../e2e/screen-audit/engine/sweep.mjs";
import { screensForFiles, sharedSamples } from "../e2e/screen-audit/hall/screen-map.mjs";
import { screens } from "../e2e/screen-audit/hall/screens.mjs";

/* Rules of the screen audit that run without a browser: widths, targeted pass, grouping and the design table. */

const known = new Set(screens.map((screen) => screen.id));

test("thresholds cut the window into intervals whose two ends are measured", () => {
  const intervals = intervalsOf([761, 1001, 761, 2000, 300], 320, 1600);
  assert.deepEqual(intervals, [
    { from: 320, to: 760 },
    { from: 761, to: 1000 },
    { from: 1001, to: 1600 },
  ]);
  assert.equal(intervalLabel(intervals, 900), "de 761 à 1000 px");
  assert.deepEqual(planWidths(intervals), [
    { width: 320, full: true },
    { width: 760, full: false },
    { width: 761, full: true },
    { width: 1000, full: false },
    { width: 1001, full: true },
    { width: 1600, full: false },
  ]);
});

test("the decision rules run once per interval, at its narrowest end; a one-pixel interval is measured once", () => {
  const plan = planWidths(intervalsOf([760, 761], 320, 1600));
  assert.deepEqual(
    plan.filter((step) => step.width === 760),
    [{ width: 760, full: true }],
  );
  assert.equal(plan.filter((step) => step.full).length, 3);
});

test("a targeted pass keeps the intervals that cross its ranges, and the finger stops below the computer", () => {
  const intervals = intervalsOf([761, 1001, 1281], 320, 1600);
  assert.deepEqual(
    planWidths(intervals, { only: parseRanges("800-900") }).map((step) => step.width),
    [761, 1000],
  );
  assert.deepEqual(
    planWidths(intervals, { below: 1280 }).map((step) => step.width),
    [320, 760, 761, 1000, 1001, 1280],
  );
  assert.throws(() => parseRanges("900-800"), /illisible/);
  assert.equal(parseRanges(""), null);
});

test("a changed file leads to its screens, a shared component to its declared sample, an unknown file to the verifier", () => {
  const target = screensForFiles(
    [
      "packages/client/src/pages/UserPage.tsx",
      "packages/client/src/components/ui/field.tsx",
      "packages/client/src/lib/unknown.ts",
      "packages/client/tests/screen-audit.test.mjs",
      "packages/server/src/index.ts",
    ],
    known,
  );
  assert.deepEqual(
    new Set(target.screens),
    new Set(["utilisateurs", "utilisateur", "utilisateur-creation", "contact", "seance-preparation", "parametres", "document-texte"]),
  );
  assert.deepEqual(target.unmapped, ["src/lib/unknown.ts"]);
  assert.equal(target.reasons.find((reason) => reason.file.endsWith("field.tsx")).component, "champ de formulaire");
});

test("every declared sample names three or four screens of the audit", () => {
  for (const sample of sharedSamples) {
    assert.ok(
      sample.screens.length >= 3 && sample.screens.length <= 4,
      `${sample.component}: ${sample.screens.length} écrans`,
    );
    for (const id of sample.screens)
      assert.ok(known.has(id), `${sample.component}: ${id} n'est pas un écran de l'outil`);
  }
});

test("findings are grouped by screen, rule and selector, with the intervals and states where they appear", () => {
  const intervals = intervalsOf([761], 320, 1600);
  const raw = [
    {
      screen: "accueil",
      rule: "overlap",
      selector: "a",
      detail: "d",
      width: 320,
      input: "touch",
      menu: "—",
      pane: "—",
      text: "réel",
    },
    {
      screen: "accueil",
      rule: "overlap",
      selector: "a",
      detail: "d",
      width: 760,
      input: "touch",
      menu: "—",
      pane: "—",
      text: "réel",
    },
    {
      screen: "accueil",
      rule: "overlap",
      selector: "a",
      detail: "d",
      width: 320,
      input: "touch",
      menu: "—",
      pane: "—",
      text: "réel",
    },
  ];
  const [group] = groupFindings(raw, intervals);
  assert.equal(group.key, "accueil | overlap | a");
  assert.equal(group.cases.length, 2);
  assert.match(group.cases[0], /^de 320 à 760 px \(320 px\), doigt, menu —/);
});

test("a shared component drawn two ways in one variant is a finding; two variants are not", () => {
  const entry = (signature, variant = "souris") => ({
    component: "menu",
    variant,
    signature,
    screen: "accueil",
    width: 900,
    menu: "déplié",
  });
  assert.equal(unityFindings([entry("hauteur 32 px"), entry("hauteur 32 px")], () => "").length, 0);
  assert.equal(unityFindings([entry("hauteur 32 px"), entry("hauteur 44 px", "tactile")], () => "").length, 0);
  const [finding] = unityFindings([entry("hauteur 32 px"), entry("hauteur 47 px")], () => "");
  assert.equal(finding.rule, "component-unity");
  assert.equal(finding.cases.length, 2);
});

test("the design table is drawn from « Design de référence » only, cites its page and element, and lists what it lacks", () => {
  const table = JSON.parse(
    readFileSync(join(import.meta.dirname, "../e2e/screen-audit/hall/design-reference.json"), "utf8"),
  );
  assert.deepEqual(table.tolerance, { color: 0, px: 1 });
  for (const entry of table.entries) {
    const name = `${entry.component} · ${entry.property}`;
    assert.equal(entry.source?.doc, "Hall 1.3 — Design de référence", `${name}: source`);
    assert.ok(entry.source.page >= 1 && entry.source.page <= 6 && entry.source.element, `${name}: page et élément`);
    assert.equal(entry.status, "retenu", `${name}: no contradiction is kept`);
    assert.ok(["all", "mouse", "finger", "touch", "pointer-wide"].includes(entry.when), `${name}: ${entry.when}`);
    if (/color$/.test(entry.property) && entry.expected !== "transparent")
      assert.match(entry.expected, /^#[0-9A-F]{6}$/, `${name}: couleur écrite en hexadécimal`);
    if (/^(height|width|font-size|border-radius|padding-\w+|column-gap|border-\w+-width)$/.test(entry.property))
      assert.match(String(entry.expected), /^\d+(\.\d+)?px(\.\.\d+(\.\d+)?px)?$/, `${name}: longueur en px`);
  }
  const value = (component, property) =>
    table.entries.find((entry) => entry.component === component && entry.property === property)?.expected;
  // Page 6 of « Design de référence » (elements v66, v67, v88 to v94, v118).
  assert.equal(value("bouton secondaire", "background-color"), "#E8EEFC");
  assert.equal(value("bouton secondaire", "color"), "#1B45AD");
  assert.equal(value("bouton", "font-weight"), "650");
  assert.equal(value("bouton", "border-radius"), "4px");
  assert.deepEqual(
    table.entries
      .filter((entry) => entry.component === "bouton" && entry.property === "height")
      .map((entry) => [entry.when, entry.expected]),
    [
      ["mouse", "32px"],
      ["finger", "44px"],
    ],
  );
  assert.equal(value("état après un point", "width"), "8px");
  const missing = table.missing.map((entry) => entry.component);
  for (const component of ["ligne de liste", "bandeau", "barre du bas"])
    assert.ok(missing.includes(component), component);
  // A value the reference does not give is not applied: no list row, header or bottom bar dimension.
  for (const component of ["ligne de liste", "bandeau", "barre du bas"])
    assert.ok(
      !table.entries.some(
        (entry) => entry.component === component && /height|size|padding|radius|weight/.test(entry.property),
      ),
      component,
    );
});

test("every rule of the screen audit says what is expected, and the interface names only code and rules that exist", async () => {
  const { conformanceRules } = await import("../e2e/screen-audit/engine/conformance.mjs");
  const { sweepRules } = await import("../e2e/screen-audit/engine/sweep.mjs");
  const { components } = await import("../e2e/screen-audit/hall/interface.mjs");
  const rules = { ...sweepRules, ...conformanceRules };
  for (const [id, definition] of Object.entries(rules)) {
    assert.ok(definition.title?.trim(), `${id}: titre`);
    assert.ok(definition.expected?.trim().endsWith("."), `${id}: phrase de ce qui est attendu`);
  }
  const repository = join(import.meta.dirname, "../../..");
  const table = JSON.parse(
    readFileSync(join(import.meta.dirname, "../e2e/screen-audit/hall/design-reference.json"), "utf8"),
  );
  const tableComponents = new Set([...table.entries, ...table.missing].map((entry) => entry.component));
  for (const component of components) {
    for (const path of component.code)
      assert.ok(existsSync(join(repository, path)), `${component.name}: ${path} n'existe pas`);
    for (const rule of component.rules) assert.ok(rules[rule], `${component.name}: la règle ${rule} n'existe pas`);
    for (const name of component.values)
      assert.ok(tableComponents.has(name), `${component.name}: ${name} absent de la table`);
  }
});

test("the rules of the interface are written out from the tool, for all or one component, and explained for a file", async () => {
  const { explain, writeRules } = await import("../e2e/screen-audit/hall/rules-text.mjs");
  const all = writeRules();
  for (const heading of [
    "Bouton",
    "Champ de formulaire",
    "État",
    "Ligne de liste",
    "Barre latérale",
    "Barre du bas du téléphone",
    "Règles transverses",
  ])
    assert.match(all, new RegExp(`^## ${heading}`, "m"), heading);
  assert.match(all, /Valeur manquante/);
  assert.match(all, /Décidé, non contrôlé/);
  const button = writeRules("bouton");
  assert.match(button, /\[single-primary\]/);
  assert.match(button, /bouton secondaire · background-color : #E8EEFC/);
  assert.doesNotMatch(button, /## Champ de formulaire/);
  assert.match(writeRules("champ"), /« Non renseigné »/);
  assert.throws(() => writeRules("inexistant"), /Composant inconnu/);
  assert.match(explain("src/components/ui/field.tsx"), /## Champ de formulaire/);
  assert.match(explain("document-texte"), /Élément ouvert/);
});
