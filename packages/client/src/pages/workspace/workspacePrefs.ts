import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isWorkspaceItemReference, sameWorkspaceItem, type WorkspaceItemReference } from "./workspaceItemReference";

export type WorkspacePin = WorkspaceItemReference;

interface WorkspacePrefsState {
  treeCollapsed: boolean;
  pins: WorkspacePin[];
  toggleTree(): void;
  isPinned(pin: WorkspacePin): boolean;
  togglePin(pin: WorkspacePin): void;
}

/** Local workspace preferences (tree collapse, pins). */
export const useWorkspacePrefsStore = create<WorkspacePrefsState>()(
  persist(
    (set, get) => ({
      treeCollapsed: false,
      pins: [],
      toggleTree() {
        set((state) => ({ treeCollapsed: !state.treeCollapsed }));
      },
      isPinned(pin) {
        return get().pins.some((candidate) => sameWorkspaceItem(candidate, pin));
      },
      togglePin(pin) {
        set((state) => ({
          pins: state.pins.some((candidate) => sameWorkspaceItem(candidate, pin))
            ? state.pins.filter((candidate) => !sameWorkspaceItem(candidate, pin))
            : [...state.pins, pin],
        }));
      },
    }),
    {
      name: "mairie.workspace.prefs",
      merge(persisted, current) {
        const stored = persisted && typeof persisted === "object" ? (persisted as Record<string, unknown>) : {};
        return {
          ...current,
          treeCollapsed: typeof stored.treeCollapsed === "boolean" ? stored.treeCollapsed : current.treeCollapsed,
          pins: Array.isArray(stored.pins) ? stored.pins.filter(isWorkspaceItemReference) : [],
        };
      },
    },
  ),
);
