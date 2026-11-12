import { create } from "zustand";

/** Number of messages in « Brouillons » and « Envoyés », as the Courriels screen last read them, for the menu. */
export const useMailCountsStore = create<{
  drafts: number | null;
  sent: number | null;
  set(counts: { drafts: number; sent: number }): void;
}>()((set) => ({
  drafts: null,
  sent: null,
  set: (counts) => set(counts),
}));
