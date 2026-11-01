/** The single territory shown by the desktop demonstration. */
export interface LaunchTarget {
  communeCode: string;
  departementCode: string;
  presentation: "alesia";
}

/** The validated Alésia introduction is independent of municipality settings. */
export const alesiaTarget: LaunchTarget = { communeCode: "39129", departementCode: "39", presentation: "alesia" };
