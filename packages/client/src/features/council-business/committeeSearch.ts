import type { CouncilBusinessCommitteeLink } from "@hall/api-contract";
import { normalizeForSearch } from "../../lib/search.ts";

export interface CommitteeCandidate {
  id: string;
  name: string;
}

/** Candidate search excludes linked commissions and ignores accents and case. */
export function matchingCommitteeCandidates(
  candidates: readonly CommitteeCandidate[],
  associations: readonly CouncilBusinessCommitteeLink[],
  query: string,
): CommitteeCandidate[] {
  const linked = new Set(associations.map((association) => association.committeeId));
  const terms = normalizeForSearch(query).trim().split(/\s+/).filter(Boolean);
  return candidates.filter(
    (candidate) =>
      !linked.has(candidate.id) && terms.every((term) => normalizeForSearch(candidate.name).includes(term)),
  );
}
