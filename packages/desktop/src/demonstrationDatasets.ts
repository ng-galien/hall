/** Demonstration datasets offered at the first opening, in their order on the choice screen. */
export const demonstrationDatasets = ["foncine-le-bas", "alesia"] as const;
export type DemonstrationDataset = (typeof demonstrationDatasets)[number];

export function isDemonstrationDataset(value: unknown): value is DemonstrationDataset {
  return typeof value === "string" && (demonstrationDatasets as readonly string[]).includes(value);
}
