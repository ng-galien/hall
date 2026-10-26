import { seedAlesia } from "./datasets/alesia/index.mjs";
import { seedHistory } from "./scenarios/history.mjs";
import { seedPreparation } from "./scenarios/preparation.mjs";

export const scenarios = {
  preparation: {
    description: "Une séance close à trois scrutins, puis la séance suivante datée, en préparation, avec cinq points.",
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
};

export const datasets = {
  alesia: {
    description:
      "Commune fictive : 15 élus, 2 contacts externes, 2 commissions de quatre membres, 5 comptes, 8 affaires, 16 sujets, deux cartes, trois tableurs, ressources et templates.",
    scenarios: ["preparation", "default", "minutes"],
    run: seedAlesia,
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
