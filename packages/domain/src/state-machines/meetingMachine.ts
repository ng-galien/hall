import { getNextSnapshot, setup } from "xstate";
import { defineExhaustiveLiterals, matchLiteral } from "../match.js";
import type { MeetingStatus } from "../model.js";

export type MeetingEvent =
  | { type: "SCHEDULE" }
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "CLOSE_AFTER_QUORUM_FAILURE" }
  | { type: "CANCEL" };

export const meetingEventTypes = defineExhaustiveLiterals<MeetingEvent["type"]>()([
  "SCHEDULE",
  "OPEN",
  "CLOSE",
  "CLOSE_AFTER_QUORUM_FAILURE",
  "CANCEL",
] as const);

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

/* Stryker disable ObjectLiteral: XState types are compile-time metadata erased from the runtime machine. */
export const meetingMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as MeetingEvent,
  },
}).createMachine(meetingMachineDefinition);
/* Stryker restore ObjectLiteral */

export function transitionMeeting(status: MeetingStatus, event: MeetingEvent): MeetingStatus | null {
  const current = meetingMachine.resolveState({ value: status, context: {} });
  if (!current.can(event)) return null;
  return getNextSnapshot(meetingMachine, current, event).value as MeetingStatus;
}

/** Preparation may still change the agenda before the meeting starts. */
export function meetingAgendaCanChange(status: MeetingStatus): boolean {
  return matchLiteral(status, {
    draft: () => true,
    scheduled: () => true,
    inProgress: () => false,
    closed: () => false,
    cancelled: () => false,
  });
}

/** Attendance remains correctable from roll call until the meeting closes. */
export function meetingAttendanceCanChange(status: MeetingStatus): boolean {
  return matchLiteral(status, {
    draft: () => false,
    scheduled: () => true,
    inProgress: () => true,
    closed: () => false,
    cancelled: () => false,
  });
}

/** Closed and cancelled meetings belong to the historical collection. */
export function meetingIsFinished(status: MeetingStatus): boolean {
  return matchLiteral(status, {
    draft: () => false,
    scheduled: () => false,
    inProgress: () => false,
    closed: () => true,
    cancelled: () => true,
  });
}
