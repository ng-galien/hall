import { councilBusinessAgendaProfile } from "./councilBusinessPolicy.js";
import { matchLiteral } from "./match.js";
import type { AgendaItemStatus, CouncilBusiness } from "./model.js";

/**
 * Fixed groups of the municipal agenda. Ordering inside one group remains a
 * preparation choice; crossing group boundaries is a business invariant.
 */
export function agendaBusinessRank(business: CouncilBusiness): number {
  return councilBusinessAgendaProfile(business).rank;
}

export function isAgendaBusinessOrderValid(businesses: readonly CouncilBusiness[]): boolean {
  return businesses.every(
    (business, index) => index === 0 || agendaBusinessRank(businesses[index - 1]) <= agendaBusinessRank(business),
  );
}

/** Whether an agenda occurrence still represents the current mutable occurrence of a business. */
export function agendaItemIsOpen(status: AgendaItemStatus): boolean {
  return matchLiteral(status, {
    scheduled: () => true,
    inProgress: () => true,
    examined: () => false,
    postponed: () => false,
    withdrawn: () => false,
  });
}
