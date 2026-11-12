import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    new Set(["utilisateurs", "utilisateur", "contact", "seance-preparation", "parametres", "document-texte"]),
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

test("the design table cites a Maket page and element for every value, and applies no contradiction", () => {
  const table = JSON.parse(
    readFileSync(join(import.meta.dirname, "../e2e/screen-audit/hall/design-reference.json"), "utf8"),
  );
  assert.deepEqual(table.tolerance, { color: 0, px: 1 });
  for (const entry of table.entries) {
    const name = `${entry.component} · ${entry.property}`;
    assert.ok(entry.source?.doc && entry.source.page && entry.source.element, `${name}: source`);
    assert.ok(["retenu", "contradiction"].includes(entry.status), `${name}: ${entry.status}`);
    assert.ok(["all", "touch", "pointer-wide"].includes(entry.when), `${name}: ${entry.when}`);
    if (entry.status === "contradiction") assert.ok(entry.note, `${name}: a contradiction cites the other board`);
    if (/color$/.test(entry.property) && entry.expected !== "transparent")
      assert.match(entry.expected, /^#[0-9A-F]{6}$/, `${name}: couleur écrite en hexadécimal`);
    if (/^(height|width|font-size|border-radius|padding-\w+|column-gap|border-\w+-width)$/.test(entry.property))
      assert.match(String(entry.expected), /^\d+(\.\d+)?px(\.\.\d+(\.\d+)?px)?$/, `${name}: longueur en px`);
  }
  const secondary = table.entries.filter(
    (entry) => entry.component === "bouton secondaire" && /color$/.test(entry.property),
  );
  assert.ok(
    secondary.every((entry) => entry.status === "contradiction"),
    "the secondary button colours wait for the owner",
  );
});
