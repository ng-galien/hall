import { getNextSnapshot, setup } from "xstate";
import { defineExhaustiveLiterals } from "../match.js";
import type { AgendaItemStatus } from "../model.js";

export type AgendaItemEvent = { type: "START" } | { type: "COMPLETE" } | { type: "POSTPONE" } | { type: "WITHDRAW" };

export const agendaItemEventTypes = defineExhaustiveLiterals<AgendaItemEvent["type"]>()([
  "START",
  "COMPLETE",
  "POSTPONE",
  "WITHDRAW",
] as const);

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

/* Stryker disable ObjectLiteral: XState types are compile-time metadata erased from the runtime machine. */
export const agendaItemMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as AgendaItemEvent,
  },
}).createMachine(agendaItemMachineDefinition);
/* Stryker restore ObjectLiteral */

export function transitionAgendaItem(state: AgendaItemStatus, event: AgendaItemEvent): AgendaItemStatus | null {
  const current = agendaItemMachine.resolveState({ value: state, context: {} });
  if (!current.can(event)) return null;
  return getNextSnapshot(agendaItemMachine, current, event).value as AgendaItemStatus;
}
