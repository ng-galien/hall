import { getNextSnapshot, setup } from "xstate";
import type { AgendaItemStatus } from "../model.js";

export type AgendaItemEvent = { type: "START" } | { type: "COMPLETE" } | { type: "POSTPONE" } | { type: "WITHDRAW" };

export const agendaItemMachineDefinition = {
  id: "agendaItem",
  initial: "scheduled",
  context: {},
  states: {
    scheduled: {
      on: {
        START: "inProgress",
        POSTPONE: "postponed",
        WITHDRAW: "withdrawn",
      },
    },
    inProgress: {
      on: {
        COMPLETE: "examined",
        POSTPONE: "postponed",
        WITHDRAW: "withdrawn",
      },
    },
    examined: { type: "final" },
    postponed: { type: "final" },
    withdrawn: { type: "final" },
  },
} as const;

export const agendaItemMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as AgendaItemEvent,
  },
}).createMachine(agendaItemMachineDefinition);

export function transitionAgendaItem(state: AgendaItemStatus, event: AgendaItemEvent): AgendaItemStatus | null {
  const current = agendaItemMachine.resolveState({ value: state, context: {} });
  if (!current.can(event)) return null;
  return getNextSnapshot(agendaItemMachine, current, event).value as AgendaItemStatus;
}
