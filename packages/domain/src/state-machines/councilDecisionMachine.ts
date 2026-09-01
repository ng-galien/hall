import { getNextSnapshot, setup } from "xstate";
import { defineExhaustiveLiterals, matchLiteral } from "../match.js";
import type { CouncilDecisionStatus } from "../model.js";

export type CouncilDecisionEvent =
  | { type: "MARK_READY" }
  | { type: "SCHEDULE" }
  | { type: "RETURN_TO_PREPARATION" }
  | { type: "RECORD_ADOPTION" }
  | { type: "RECORD_REJECTION" }
  | { type: "REOPEN_BALLOT" }
  | { type: "MAKE_ENFORCEABLE" };

export const councilDecisionEventTypes = defineExhaustiveLiterals<CouncilDecisionEvent["type"]>()([
  "MARK_READY",
  "SCHEDULE",
  "RETURN_TO_PREPARATION",
  "RECORD_ADOPTION",
  "RECORD_REJECTION",
  "REOPEN_BALLOT",
  "MAKE_ENFORCEABLE",
] as const);

export const councilDecisionMachineDefinition = {
  id: "councilDecision",
  initial: "draft",
  context: {},
  states: {
    draft: {
      on: {
        MARK_READY: "ready",
        SCHEDULE: "scheduled",
      },
    },
    ready: {
      on: {
        SCHEDULE: "scheduled",
      },
    },
    scheduled: {
      on: {
        RETURN_TO_PREPARATION: "ready",
        RECORD_ADOPTION: "adopted",
        RECORD_REJECTION: "rejected",
      },
    },
    adopted: {
      on: {
        REOPEN_BALLOT: "scheduled",
        MAKE_ENFORCEABLE: "enforceable",
      },
    },
    rejected: {
      on: {
        REOPEN_BALLOT: "scheduled",
      },
    },
    enforceable: { type: "final" },
  },
} as const;

/* Stryker disable ObjectLiteral: XState types are compile-time metadata erased from the runtime machine. */
export const councilDecisionMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as CouncilDecisionEvent,
  },
}).createMachine(councilDecisionMachineDefinition);
/* Stryker restore ObjectLiteral */

export function transitionCouncilDecision(
  status: CouncilDecisionStatus,
  event: CouncilDecisionEvent,
): CouncilDecisionStatus | null {
  const current = councilDecisionMachine.resolveState({ value: status, context: {} });
  if (!current.can(event)) return null;
  return getNextSnapshot(councilDecisionMachine, current, event).value as CouncilDecisionStatus;
}

/** Content remains editable while the decision is being prepared or merely scheduled. */
export function councilDecisionContentCanChange(status: CouncilDecisionStatus): boolean {
  return matchLiteral(status, {
    draft: () => true,
    ready: () => true,
    scheduled: () => true,
    adopted: () => false,
    rejected: () => false,
    enforceable: () => false,
  });
}
