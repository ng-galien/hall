import { alesiaAdministrator } from "./datasets/alesia/directory.mjs";
import { seedAlesia } from "./datasets/alesia/index.mjs";
import { foncineAdministrator } from "./datasets/foncine-le-bas/directory.mjs";
import { seedFoncineLeBas } from "./datasets/foncine-le-bas/index.mjs";
import {
  seedFoncineEmpty,
  seedFoncineMinutes,
  seedFoncinePreparation,
  seedFoncineSession,
} from "./datasets/foncine-le-bas/meetings.mjs";
import { seedFresh } from "./scenarios/fresh.mjs";
import { seedHistory } from "./scenarios/history.mjs";
import { seedPreparation } from "./scenarios/preparation.mjs";

export const scenarios = {
  fresh: {
    description: "Une séance provisionnée sans date, ordre du jour vide, aucun scrutin.",
    run: seedFresh,
  },
  preparation: {
    description:
      "Une séance close à trois scrutins, puis la séance suivante en préparation, sans date, avec cinq points.",
    run: seedPreparation,
  },
  default: {
    description: "Deux séances closes à trois scrutins chacune, troisième séance en cours.",
    run: (api, fixture) => seedHistory(api, fixture),
  },
  minutes: {
    description: "Trois séances closes, troisième PV modifiable sans PDF généré, quatrième séance datée.",
    run: (api, fixture) => seedHistory(api, fixture, { editableMinutes: true }),
  },
  "foncine-le-bas-empty": {
    description: "Foncine-le-Bas : une séance sans date, ordre du jour vide.",
    run: seedFoncineEmpty,
  },
  "foncine-le-bas-preparation": {
    description: "Foncine-le-Bas : séance n° 1 close (J−35), séance n° 2 en préparation datée à J+10 avec six points.",
    run: seedFoncinePreparation,
  },
  "foncine-le-bas-session": {
    description: "Foncine-le-Bas : séances n° 1 à 3 closes, séance n° 4 en cours, vote du chemin du Mont Noir à mener.",
    run: seedFoncineSession,
  },
  "foncine-le-bas-minutes": {
    description:
      "Foncine-le-Bas : séance n° 4 close, procès-verbal modifiable non généré, séance n° 5 datée à J+14 avec trois sujets.",
    run: seedFoncineMinutes,
  },
};

export const datasets = {
  alesia: {
    description:
      "Commune fictive : 15 élus, 2 contacts externes, 2 commissions de quatre membres, 5 comptes, 10 affaires, 16 sujets, une représentation extérieure, deux cartes, quatre tableurs, ressources et templates.",
    scenarios: ["fresh", "preparation", "default", "minutes"],
    administrator: alesiaAdministrator,
    run: seedAlesia,
  },
  "foncine-le-bas": {
    description:
      "Territoire réel de Foncine-le-Bas, personnes et faits fictifs : 11 élus, 2 agents, 15 contacts, 3 commissions, 5 comptes, 11 affaires, 6 cartes et une couche cadastrale, PDF, images, document Word, tableurs, rendez-vous et courriels.",
    scenarios: [
      "foncine-le-bas-empty",
      "foncine-le-bas-preparation",
      "foncine-le-bas-session",
      "foncine-le-bas-minutes",
    ],
    administrator: foncineAdministrator,
    run: seedFoncineLeBas,
  },
};

export function selectSeed(datasetName, scenarioName) {
  if (!Object.hasOwn(datasets, datasetName)) throw new Error(`Jeu de données inconnu : ${datasetName}`);
  if (!Object.hasOwn(scenarios, scenarioName)) throw new Error(`Scénario inconnu : ${scenarioName}`);
  const dataset = datasets[datasetName];
  if (!dataset.scenarios.includes(scenarioName)) {
    throw new Error(`Le jeu ${datasetName} ne prend pas en charge le scénario ${scenarioName}`);
  }
  return { dataset, scenario: scenarios[scenarioName] };
}

export function describeSeeds() {
  return [
    "Jeux de données (contenu) :",
    ...Object.entries(datasets).map(
      ([name, entry]) => `  ${name}: ${entry.description}\n    Scénarios : ${entry.scenarios.join(", ")}`,
    ),
    "Scénarios de séance (état final) :",
    ...Object.entries(scenarios).map(([name, entry]) => `  ${name}: ${entry.description}`),
    "Valeurs par défaut : --dataset alesia --scenario default",
  ].join("\n");
}
