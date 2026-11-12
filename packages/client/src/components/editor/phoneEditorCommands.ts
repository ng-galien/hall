import type { ReactNode } from "react";
import { create } from "zustand";

/** A writing command of the editor that a phone lists in the « ⋯ » menu of the screen header. */
export interface PhoneEditorCommand {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect(): void;
}

/** The writing commands of the text being written on a phone; empty while no text is written. */
export const usePhoneEditorCommands = create<{
  commands: PhoneEditorCommand[];
  set(commands: PhoneEditorCommand[]): void;
}>((set) => ({
  commands: [],
  set: (commands) => set({ commands }),
}));
