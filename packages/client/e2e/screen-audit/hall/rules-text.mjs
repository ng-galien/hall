import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { conformanceRules } from "../engine/conformance.mjs";
import { sweepRules } from "../engine/sweep.mjs";
import { components, declaredThresholds, outOfCatalogue } from "./interface.mjs";
import { screenFiles, screensForFiles, sharedSamples } from "./screen-map.mjs";
import { screens } from "./screens.mjs";
import { sweepPlan } from "./sweep-config.mjs";

/*
 * The rules of the Hall interface, written out from the data the screen audit runs: the rule sentences, the design
 * values, the exceptions, the samples and the thresholds. `--rules` writes them all or one component; `--explain`
 * writes the rules that apply to a file or a screen. No browser is started.
 */

const clientDirectory = resolve(import.meta.dirname, "../../..");
const rules = { ...sweepRules, ...conformanceRules };
const table = sweepPlan.designReference;

/** Width thresholds written in the sources (style sheets and scripts), with their files. */
function sourceThresholds() {
  const found = new Map();
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(css|tsx?)$/.test(entry)) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(/@(media|container)\s[^{]*\((min|max)-width:\s*([\d.]+)(px|rem)\)/g)) {
          const value = Number(match[3]) * (match[4] === "rem" ? 16 : 1);
          const key = `@${match[1]} ${match[2]}-width: ${value}px`;
          found.set(key, [...(found.get(key) ?? []), relative(clientDirectory, path)]);
        }
        for (const match of source.matchAll(/["'`]\((max|min)-width:\s*(\d+)px\)/g)) {
          const key = `script ${match[1]}-width: ${match[2]}px`;
          found.set(key, [...(found.get(key) ?? []), relative(clientDirectory, path)]);
        }
      }
    }
  };
  visit(resolve(clientDirectory, "src"));
  return [...found.entries()].sort();
}

const sentence = (id) => (rules[id] ? `${rules[id].expected} [${id}]` : `règle inconnue de l'outil : ${id}`);

function valuesOf(component) {
  const lines = [];
  for (const entry of table.entries.filter((value) => component.values.includes(value.component))) {
    const when = {
      all: "",
      mouse: " à la souris",
      finger: " au doigt",
      touch: " au téléphone ou au doigt",
      "pointer-wide": " à la souris sur ordinateur",
    }[entry.when];
    lines.push(
      `    ${entry.component} · ${entry.property}${entry.pseudo ? ` ${entry.pseudo}` : ""}${when} : ${entry.expected} (${entry.decision ? `décision du propriétaire du ${entry.decision.date}, ${entry.decision.words}, ${entry.decision.commits.join(", ")}` : `${entry.source.doc}, page ${entry.source.page}, ${entry.source.element}`})`,
    );
    for (const variant of entry.variants ?? [])
      lines.push(
        `      variante « ${variant.name} » (libellé ${variant.label}) : ${variant.expected} (${variant.source})`,
      );
  }
  return lines;
}

function writeComponent(component) {
  const lines = [
    `## ${component.name}`,
    `  Code : ${component.code.join(", ")}`,
    `  Variantes : ${component.variants.join(" ; ")}`,
    "  Règles :",
  ];
  for (const id of component.rules) lines.push(`    - ${sentence(id)}`);
  const values = valuesOf(component);
  if (component.settings === "formField") {
    const field = sweepPlan.formField;
    values.push(
      `    filet au repos : ${field.rest.color}, ${field.rest.width} px ; en saisie : ${field.focus.color}, ${field.focus.width} px ; en erreur : ${field.error.color}, ${field.error.width} px ; en lecture seule : aucun (${table.entries.find((entry) => entry.component === "champ de formulaire")?.source.doc ?? "Hall 1.3 \u2014 Design de référence"}, page 5, h74)`,
      `    libellé : ${field.label} ; champ vide : « ${field.empty.text} », ${field.empty.color}, italique (page 5, h76 et h78)`,
    );
  }
  lines.push(values.length ? "  Valeurs de dessin :" : "  Valeurs de dessin : aucune dans la référence.", ...values);
  const missing = table.missing.filter(
    (entry) => component.values.includes(entry.component) || entry.component === component.name.toLowerCase(),
  );
  for (const entry of missing) lines.push(`  Valeur manquante : ${entry.values}.`);
  for (const entry of component.decided) lines.push(`  Décidé, non contrôlé : ${entry.what} (${entry.source}).`);
  for (const [rule, list] of Object.entries(sweepPlan.exceptions))
    for (const exception of list)
      if (component.rules.includes(rule))
        lines.push(`  Exception à ${rule} : ${exception.selector} : ${exception.reason}`);
  const sample = component.code.map((path) => sharedSamples.find((entry) => entry.files.test(path))).find(Boolean);
  if (sample)
    lines.push(
      `  Écrans d'un passage ciblé quand il change : ${sample.screens.join(", ")} (échantillon « ${sample.component} »).`,
    );
  return lines;
}

/** The rules of the interface, all or those of one component (`only`: an id or the start of a name). */
export function writeRules(only = null) {
  const chosen = only
    ? components.filter(
        (component) => component.id === only || component.name.toLowerCase().startsWith(only.toLowerCase()),
      )
    : components;
  if (only && !chosen.length)
    throw new Error(
      `Composant inconnu : ${only}. Composants : ${components.map((component) => component.id).join(", ")}`,
    );
  const lines = [
    "# Règles de l'interface de Hall",
    "Source : l'outil de vérification des écrans (packages/client/e2e/screen-audit). Chaque phrase est la définition d'une règle exécutée ; entre crochets, son nom dans les rapports.",
    `Valeurs : « Hall 1.3 \u2014 Design de référence », table hall/design-reference.json ; couleur exacte, dimension à ${table.tolerance.px} px près.`,
    "",
  ];
  for (const component of chosen) lines.push(...writeComponent(component), "");
  if (only) return lines.join("\n");
  const attached = new Set(components.flatMap((component) => component.rules));
  lines.push("## Règles transverses");
  for (const id of Object.keys(rules)) if (!attached.has(id)) lines.push(`  - ${sentence(id)}`);
  lines.push(
    "  - Une mise en page change seulement à un seuil déclaré ; un composant partagé de components/ui, la ligne de liste et les commandes suivent la largeur de leur conteneur.",
    "  - Seul styles/controls.css dessine le fond, le filet et la hauteur d'un champ de formulaire.",
    `  Seuils déclarés : fenêtre ${declaredThresholds.viewport.join(", ")} px ; conteneur ${declaredThresholds.container.join(", ")} px.`,
    "  Seuils écrits dans les sources :",
  );
  for (const [key, files] of sourceThresholds()) lines.push(`    ${key} : ${[...new Set(files)].join(", ")}`);
  lines.push(
    "  Mesure : chaque écran de 320 à 1600 px, aux deux bouts de chaque intervalle entre seuils, menu déplié et replié, à la souris et au doigt, puis avec des textes longs.",
  );
  const missingElsewhere = table.missing.filter(
    (entry) =>
      !components.some(
        (component) => component.values.includes(entry.component) || entry.component === component.name.toLowerCase(),
      ),
  );
  for (const entry of missingElsewhere) lines.push(`  Valeur manquante (${entry.component}) : ${entry.values}.`);
  lines.push("", "## Sorti du catalogue des exigences, non contrôlé");
  for (const entry of outOfCatalogue) lines.push(`  - ${entry.what} (${entry.from}).`);
  return lines.join("\n");
}

/** The rules that apply to a file of the client or to a screen of the audit. */
export function explain(target) {
  const screen = screens.find((entry) => entry.id === target);
  const lines = [];
  if (screen) {
    lines.push(`# Écran « ${screen.title} » (${screen.id})`, `  Formats : ${screen.formats.join(", ")}.`);
    if (sweepPlan.isItem(screen)) lines.push(`  Élément ouvert : ${sentence("search-on-item")}`);
    const files = screenFiles.filter(([, ids]) => ids.includes(screen.id)).map(([pattern]) => pattern.source);
    if (files.length) lines.push(`  Fichiers propres : ${files.join(" ; ")}`);
    lines.push("  Toutes les règles de l'outil s'appliquent à cet écran ; celles des composants qu'il affiche :");
    for (const component of components) lines.push(`  - ${component.name} : ${component.rules.join(", ")}`);
    return lines.join("\n");
  }
  const file = target.replace(/^.*packages\/client\//, "");
  const owners = components.filter((component) => component.code.some((path) => path.endsWith(file)));
  const target_ = screensForFiles([file], new Set(screens.map((entry) => entry.id)));
  lines.push(`# Fichier ${file}`);
  if (target_.unmapped.length)
    lines.push(
      "  Rattaché à aucun écran de l'outil : le passage ciblé échouera tant que screen-map.mjs ne le nomme pas.",
    );
  else lines.push(`  Écrans mesurés par un passage ciblé : ${target_.screens.join(", ")}.`);
  for (const component of owners) lines.push("", ...writeComponent(component));
  if (!owners.length) {
    lines.push(
      "  Ce fichier ne porte pas un composant de base ; les règles de tous les composants qu'il affiche s'appliquent :",
    );
    for (const component of components) lines.push(`  - ${component.name} : ${component.rules.join(", ")}`);
  }
  return lines.join("\n");
}
