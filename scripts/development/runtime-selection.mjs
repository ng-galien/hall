import { existsSync, readFileSync } from "node:fs";

export function readRuntimeSelection(statePath) {
  if (!existsSync(statePath)) return undefined;
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.runtimeConfig !== null && typeof state.runtimeConfig !== "string")
    throw new Error("Invalid recorded runtime configuration");
  return state.runtimeConfig;
}

export function resolveRuntimeSelection({ explicit, requested, recorded, required }) {
  if (!explicit && recorded === undefined && required)
    throw new Error("The active database configuration is unknown. Supply --runtime-config explicitly before restart.");
  const selected = explicit ? requested : recorded === undefined ? requested : recorded;
  if (selected && !existsSync(selected)) throw new Error("Recorded runtime configuration is missing");
  return selected;
}
