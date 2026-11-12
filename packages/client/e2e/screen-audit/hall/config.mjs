import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fr } from "../../../src/i18n/fr.ts";
import { defaultCollectOptions } from "../engine/capture.mjs";
import { screens } from "./screens.mjs";

/* Hall configuration of the screen audit: everything the engine needs to know about this application. */

const here = import.meta.dirname;
const clientDirectory = resolve(here, "../../..");
const rules = JSON.parse(readFileSync(resolve(here, "rules.json"), "utf8")).rules;

export const formats = [
  { id: "telephone", label: "Téléphone", width: 360, height: 740, touch: true },
  { id: "tablette", label: "Tablette", width: 768, height: 1024, touch: true },
  { id: "ordinateur", label: "Ordinateur", width: 1440, height: 900, touch: false },
];

export const collect = {
  ...defaultCollectOptions,
  ignoreSelectors: [".ol-viewport", ".univer-spreadsheet", "[data-testid=application-sync-status]"],
  chromeSelectors: ["[data-testid=phone-header]", "[data-testid=phone-navigation]", "header.app-header", "aside"],
};

/** Defects the owner observed by hand on 10 November 2026, with the rules expected to find each one. */
export const humanDefects = [
  {
    screen: "point-vote",
    format: "telephone",
    defect: "Page d'un point plus large que l'écran",
    rules: ["page-horizontal-scroll", "viewport-overflow"],
  },
  { screen: "aide", format: "telephone", defect: "Texte de l'aide écrasé", rules: ["text-line-length"] },
  {
    screen: "calendrier",
    format: "telephone",
    defect: "Quatre rangées d'outils avant le calendrier et espace perdu",
    rules: ["chrome-rows", "chrome-height"],
  },
  {
    screen: "calendrier",
    format: "telephone",
    defect: "Défilements imbriqués dans le calendrier",
    rules: ["nested-scroll"],
  },
  {
    screen: "affaire",
    format: "telephone",
    defect: "Boutons de 24 px sur la page d'une affaire",
    rules: ["touch-target-size", "painted-target-size", "component-size-consistency"],
  },
  {
    screen: "document-titre-long",
    format: "telephone",
    defect: "Titre du document coupé",
    rules: ["truncated-heading", "truncated-without-ellipsis", "clipped-content"],
  },
  {
    screen: "menu-nouveau",
    format: "telephone",
    defect: "Menu de sélection aux lignes trop petites",
    rules: ["touch-target-size"],
  },
  {
    screen: "proces-verbaux",
    format: "telephone",
    defect: "Éléments d'une ligne de bureau empilés dans chaque ligne de la liste",
    rules: ["list-item-fill", "list-item-lone-small", "list-item-height-per-row"],
  },
  {
    screen: "proces-verbaux",
    format: "telephone",
    defect: "Icône de la ligne trop petite",
    rules: ["action-icon-size"],
  },
  {
    screen: "proces-verbaux",
    format: "telephone",
    defect: "Chevron sans rôle clair dans une ligne déjà cliquable",
    rules: ["list-item-trailing-icon"],
  },
  { screen: "menu-plus", format: "telephone", defect: "Feuille « Plus » collée au bord", rules: ["edge-margin"] },
  {
    screen: "accueil",
    format: "telephone",
    defect: "État actif de la barre de navigation peu visible",
    rules: ["active-state-contrast"],
  },
];

export const config = {
  name: "Hall",
  formats,
  collect,
  rules,
  screenOrder: screens.map((screen) => screen.id),
  humanDefects,
  messages: Object.values(fr),
  outputDirectory: resolve(clientDirectory, "test-results/screen-audit"),
  baselineFile: resolve(here, "baseline.json"),
  /** Opens every screen through the disposable instance and database of the browser journeys. */
  capture({ outputDirectory, screens: selectedScreens, formats: selectedFormats }) {
    const result = spawnSync(process.execPath, [resolve(clientDirectory, "e2e/run.mjs")], {
      cwd: resolve(clientDirectory, "../.."),
      env: {
        ...process.env,
        HALL_SCREEN_AUDIT: "true",
        HALL_SCREEN_AUDIT_OUTPUT: outputDirectory,
        HALL_E2E_LANES: process.env.HALL_E2E_LANES ?? "3",
        ...(selectedScreens ? { HALL_SCREEN_AUDIT_SCREENS: selectedScreens.join(",") } : {}),
        ...(selectedFormats ? { HALL_SCREEN_AUDIT_FORMATS: selectedFormats.join(",") } : {}),
      },
      stdio: "inherit",
    });
    if (result.status !== 0) throw new Error(`the browser run ended with status ${result.status}`);
  },
};
