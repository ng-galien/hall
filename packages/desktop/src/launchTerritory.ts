import type { DemonstrationDataset } from "./demonstrationDatasets.js";

/** Territory and presentation shown by the launch screen. */
export interface LaunchTarget {
  communeCode: string;
  departementCode: string;
  presentation: DemonstrationDataset;
}

/** The validated Alésia introduction is independent of municipality settings. */
export const alesiaTarget: LaunchTarget = { communeCode: "39129", departementCode: "39", presentation: "alesia" };

/** Launch screen of each demonstration dataset; the local edition keeps the Alésia introduction. */
export const launchTargets: Record<DemonstrationDataset, LaunchTarget> = {
  alesia: alesiaTarget,
  "foncine-le-bas": { communeCode: "39227", departementCode: "39", presentation: "foncine-le-bas" },
};
