import type { ParticipationEvidence, QuorumFailureEvidence } from "@mairie/domain";

export const emptyParticipationEvidence: ParticipationEvidence = {
  rosterMemberIds: [],
  attendance: [],
  quorum: { activeMembers: 0, physicallyPresent: 0, required: 0, reached: false },
};

export function parseParticipationEvidence(value: unknown): ParticipationEvidence {
  return JSON.parse(String(value)) as ParticipationEvidence;
}

export function parseQuorumFailureEvidence(value: unknown): QuorumFailureEvidence | null {
  return value === null || value === undefined ? null : (JSON.parse(String(value)) as QuorumFailureEvidence);
}
