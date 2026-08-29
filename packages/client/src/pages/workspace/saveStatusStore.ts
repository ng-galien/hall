import { create } from "zustand";

/** Save state of the open workbench; `idle` hides the breadcrumb indicator. */
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export const useSaveStatusStore = create<{
  status: SaveStatus;
  setStatus(status: SaveStatus): void;
}>((set) => ({
  status: "idle",
  setStatus: (status) => set({ status }),
}));
