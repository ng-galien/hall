import { balanceRules } from "./balance.mjs";
import { listRules } from "./lists.mjs";
import { sizingRules } from "./sizing.mjs";

/** Every rule the engine knows. Adding a rule means declaring one more object in a family file and listing it here. */
export const engineRules = [...sizingRules, ...listRules, ...balanceRules];

export const families = {
  sizing: { title: "Dimensionnement", exploratory: false },
  lists: { title: "Éléments de liste (exploratoire)", exploratory: true },
  balance: { title: "Équilibre de l'écran (exploratoire)", exploratory: true },
};

export const severities = {
  error: "Écart",
  warning: "Avertissement",
  indicator: "Indicateur",
};
