import { getNextSnapshot, setup } from "xstate";
import type { TopicState } from "../model.js";

export type TopicEvent =
  | { type: "EDIT" }
  | { type: "SCHEDULE" }
  | { type: "RESCHEDULE" }
  | { type: "UNSCHEDULE" }
  | { type: "START" }
  | { type: "COMPLETE" }
  | { type: "POSTPONE" }
  | { type: "WITHDRAW" };

export const topicMachineDefinition = {
  id: "topic",
  initial: "toSchedule",
  context: {},
  states: {
    toSchedule: {
      on: {
        EDIT: "toSchedule",
        SCHEDULE: "scheduled",
        WITHDRAW: "withdrawn",
      },
    },
    scheduled: {
      on: {
        EDIT: "scheduled",
        RESCHEDULE: "scheduled",
        START: "inProgress",
        UNSCHEDULE: "toSchedule",
        WITHDRAW: "withdrawn",
      },
    },
    inProgress: {
      on: {
        COMPLETE: "examined",
        POSTPONE: "toSchedule",
        WITHDRAW: "withdrawn",
      },
    },
    examined: { type: "final" },
    withdrawn: { type: "final" },
  },
} as const;

export const topicMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as TopicEvent,
  },
}).createMachine(topicMachineDefinition);

export function transitionTopic(state: TopicState, event: TopicEvent): TopicState | null {
  const current = topicMachine.resolveState({ value: state, context: {} });
  if (!current.can(event)) return null;
  return getNextSnapshot(topicMachine, current, event).value as TopicState;
}
