import { matchDiscriminated } from "./match.js";
import type { BallotTarget, Identifier } from "./model.js";

export interface StoredBallotTarget {
  councilDecisionId?: Identifier | null;
  agendaItemId?: Identifier | null;
}

/**
 * Turns the two-column persistence/API representation into the domain's
 * closed target union. Callers never branch on competing nullable fields.
 */
export function ballotTargetOf(value: StoredBallotTarget): BallotTarget {
  if (value.councilDecisionId && !value.agendaItemId) {
    return { kind: "councilDecision", id: value.councilDecisionId };
  }
  if (value.agendaItemId && !value.councilDecisionId) {
    return { kind: "agendaItem", id: value.agendaItemId };
  }
  throw new Error("A ballot must target exactly one council decision or agenda item");
}

export function storedBallotTarget(target: BallotTarget): {
  councilDecisionId: Identifier | null;
  agendaItemId: Identifier | null;
} {
  return matchDiscriminated(target, "kind", {
    councilDecision: (entry) => ({ councilDecisionId: entry.id, agendaItemId: null }),
    agendaItem: (entry) => ({ councilDecisionId: null, agendaItemId: entry.id }),
  });
}
