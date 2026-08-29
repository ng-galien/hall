import { create } from "zustand";

/**
 * L'état d'enregistrement de l'établi ouvert, pour la pastille du fil d'Ariane.
 *
 * L'établi écrit, le fil d'Ariane lit : aucun câblage de props à travers la page.
 * `idle` signifie « rien à dire » — la pastille disparaît.
 */
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export const useSaveStatusStore = create<{
  status: SaveStatus;
  setStatus(status: SaveStatus): void;
}>((set) => ({
  status: "idle",
  setStatus: (status) => set({ status }),
}));
