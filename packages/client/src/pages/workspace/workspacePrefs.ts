import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspacePin = { kind: "councilBusiness"; id: string } | { kind: "resource"; id: string };

interface WorkspacePrefsState {
  treeCollapsed: boolean;
  pins: WorkspacePin[];
  toggleTree(): void;
  isPinned(pin: WorkspacePin): boolean;
  togglePin(pin: WorkspacePin): void;
}

const samePin = (left: WorkspacePin, right: WorkspacePin) => left.kind === right.kind && left.id === right.id;

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
        return get().pins.some((candidate) => samePin(candidate, pin));
      },
      togglePin(pin) {
        set((state) => ({
          pins: state.pins.some((candidate) => samePin(candidate, pin))
            ? state.pins.filter((candidate) => !samePin(candidate, pin))
            : [...state.pins, pin],
        }));
      },
    }),
    { name: "mairie.workspace.prefs" },
  ),
);
