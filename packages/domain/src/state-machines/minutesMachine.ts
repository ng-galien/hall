import { getNextSnapshot, setup } from "xstate";
import type { MinutesStatus } from "../model.js";

export type MinutesEvent =
  | { type: "GENERATE_DRAFT" }
  | { type: "FINALIZE" }
  | { type: "APPROVE" }
  | { type: "SIGN" }
  | { type: "PUBLISH" };

export const minutesMachineDefinition = {
  id: "minutes",
  initial: "notStarted",
  context: {},
  states: {
    notStarted: { on: { GENERATE_DRAFT: "draft" } },
    draft: { on: { FINALIZE: "ready" } },
    ready: { on: { APPROVE: "approved" } },
    approved: { on: { SIGN: "signed" } },
    signed: { on: { PUBLISH: "published" } },
    published: { type: "final" },
  },
} as const;

export const minutesMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as MinutesEvent,
  },
}).createMachine(minutesMachineDefinition);

export function transitionMinutes(status: MinutesStatus, event: MinutesEvent): MinutesStatus | null {
  const current = minutesMachine.resolveState({ value: status, context: {} });
  if (!current.can(event)) return null;
  return getNextSnapshot(minutesMachine, current, event).value as MinutesStatus;
}
