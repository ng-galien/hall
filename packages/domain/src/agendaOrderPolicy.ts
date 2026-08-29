import type { CouncilBusiness } from "./model.js";

/**
 * Fixed groups of the municipal agenda. Ordering inside one group remains a
 * preparation choice; crossing group boundaries is a business invariant.
 */
export function agendaBusinessRank(business: CouncilBusiness): number {
  if (business.kind === "minutesApproval") return 0;
  if (business.kind === "matter" && business.councilDecisionId) return 1;
  if (business.kind === "matter") return 2;
  return 3;
}

export function isAgendaBusinessOrderValid(businesses: readonly CouncilBusiness[]): boolean {
  return businesses.every(
    (business, index) => index === 0 || agendaBusinessRank(businesses[index - 1]) <= agendaBusinessRank(business),
  );
}
