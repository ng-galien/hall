import { matchDiscriminated } from "./match.js";
import type { CouncilBusiness, CouncilBusinessKind, CouncilMatter, Identifier } from "./model.js";

export type CouncilBusinessAgendaRole = "minutesApproval" | "decision" | "information" | "openQuestion";

export type CouncilBusinessAgendaProfile =
  | {
      role: "minutesApproval";
      rank: 0;
      councilDecisionId: null;
      committeeId: null;
      minutesOfMeetingId: Identifier;
      ballotTarget: "agendaItem";
    }
  | {
      role: "decision";
      rank: 1;
      councilDecisionId: Identifier;
      committeeId: Identifier | null;
      minutesOfMeetingId: null;
      ballotTarget: "decision";
    }
  | {
      role: "information";
      rank: 2;
      councilDecisionId: null;
      committeeId: Identifier | null;
      minutesOfMeetingId: null;
      ballotTarget: "agendaItem";
    }
  | {
      role: "openQuestion";
      rank: 3;
      councilDecisionId: null;
      committeeId: null;
      minutesOfMeetingId: null;
      ballotTarget: null;
    };

/**
 * Canonical projection of a durable council business into its agenda role.
 * Consumers keep their own effects, but must not rediscover this meaning from
 * ad hoc combinations of `kind` and nullable identifiers.
 */
export function councilBusinessAgendaProfile(business: CouncilBusiness): CouncilBusinessAgendaProfile {
  return matchDiscriminated(business, "kind", {
    minutesApproval: (entry) => ({
      role: "minutesApproval" as const,
      rank: 0 as const,
      councilDecisionId: null,
      committeeId: null,
      minutesOfMeetingId: entry.minutesOfMeetingId,
      ballotTarget: "agendaItem" as const,
    }),
    matter: (entry) =>
      entry.councilDecisionId
        ? {
            role: "decision" as const,
            rank: 1 as const,
            councilDecisionId: entry.councilDecisionId,
            committeeId: entry.committeeId,
            minutesOfMeetingId: null,
            ballotTarget: "decision" as const,
          }
        : {
            role: "information" as const,
            rank: 2 as const,
            councilDecisionId: null,
            committeeId: entry.committeeId,
            minutesOfMeetingId: null,
            ballotTarget: "agendaItem" as const,
          },
    openQuestion: () => ({
      role: "openQuestion" as const,
      rank: 3 as const,
      councilDecisionId: null,
      committeeId: null,
      minutesOfMeetingId: null,
      ballotTarget: null,
    }),
  });
}

export function councilBusinessDecisionId(business: CouncilBusiness): Identifier | null {
  return councilBusinessAgendaProfile(business).councilDecisionId;
}

/** A minutes approval is regenerated from the previous meeting instead of being carried over as an ordinary item. */
export function councilBusinessCanCarryForwardAfterPostponement(business: CouncilBusiness): boolean {
  return councilBusinessAgendaProfile(business).role !== "minutesApproval";
}

/** Only ordinary council matters can be assigned to a committee or backed by a council decision. */
export function councilBusinessIsMatter(business: CouncilBusiness): business is CouncilMatter;
export function councilBusinessIsMatter(business: CouncilBusinessKind): boolean;
export function councilBusinessIsMatter(business: CouncilBusiness | CouncilBusinessKind): boolean {
  if (typeof business === "string") return business === "matter";
  const role = councilBusinessAgendaProfile(business).role;
  return role === "decision" || role === "information";
}

export function councilBusinessHasDecision(
  business: CouncilBusiness,
): business is CouncilMatter & { councilDecisionId: Identifier } {
  return councilBusinessIsMatter(business) && business.councilDecisionId !== null;
}
