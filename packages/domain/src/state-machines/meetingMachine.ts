import { getNextSnapshot, setup } from "xstate";
import type { MeetingStatus } from "../model.js";

export type MeetingEvent =
  | { type: "SCHEDULE" }
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "CLOSE_AFTER_QUORUM_FAILURE" }
  | { type: "CANCEL" };

export const meetingMachineDefinition = {
  id: "meeting",
  initial: "draft",
  context: {},
  states: {
    draft: {
      on: {
        SCHEDULE: "scheduled",
        CANCEL: "cancelled",
      },
    },
    scheduled: {
      on: {
        OPEN: "inProgress",
        CLOSE_AFTER_QUORUM_FAILURE: "closed",
        CANCEL: "cancelled",
      },
    },
    inProgress: {
      on: {
        CLOSE: "closed",
      },
    },
    closed: { type: "final" },
    cancelled: { type: "final" },
  },
} as const;

export const meetingMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as MeetingEvent,
  },
}).createMachine(meetingMachineDefinition);

export function transitionMeeting(status: MeetingStatus, event: MeetingEvent): MeetingStatus | null {
  const current = meetingMachine.resolveState({ value: status, context: {} });
  if (!current.can(event)) return null;
  return getNextSnapshot(meetingMachine, current, event).value as MeetingStatus;
}
