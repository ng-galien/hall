import type { ParticipationEvidence, QuorumFailureEvidence } from "@hall/domain";

export const emptyParticipationEvidence: ParticipationEvidence = {
  rosterMemberIds: [],
  attendance: [],
  quorum: { activeMembers: 0, physicallyPresent: 0, required: 0, reached: false },
};

export function parseParticipationEvidence(value: unknown): ParticipationEvidence {
  return (typeof value === "string" ? JSON.parse(value) : value) as ParticipationEvidence;
}

export function parseQuorumFailureEvidence(value: unknown): QuorumFailureEvidence | null {
  return value === null || value === undefined
    ? null
    : ((typeof value === "string" ? JSON.parse(value) : value) as QuorumFailureEvidence);
}
