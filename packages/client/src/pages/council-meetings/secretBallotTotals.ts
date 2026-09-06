export interface SecretBallotTotals {
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  notVoting: number;
  blank: number;
  invalid: number;
}

export function initialSecretBallotTotals(participantCount: number): SecretBallotTotals {
  return { votesFor: 0, votesAgainst: 0, abstentions: 0, notVoting: participantCount, blank: 0, invalid: 0 };
}

export function secretBallotTotal(totals: SecretBallotTotals): number {
  return totals.votesFor + totals.votesAgainst + totals.abstentions + totals.notVoting + totals.blank + totals.invalid;
}

export function reconcileSecretBallotTotals(
  totals: SecretBallotTotals,
  previousParticipantCount: number,
  participantCount: number,
): SecretBallotTotals {
  if (secretBallotTotal(totals) === participantCount) return totals;
  if (secretBallotTotal(totals) === previousParticipantCount) {
    const adjustedNotVoting = totals.notVoting + participantCount - previousParticipantCount;
    if (adjustedNotVoting >= 0) return { ...totals, notVoting: adjustedNotVoting };
  }
  return initialSecretBallotTotals(participantCount);
}
