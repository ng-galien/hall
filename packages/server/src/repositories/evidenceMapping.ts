import {
  type ParticipationEvidence,
  participationEvidenceSchema,
  type QuorumFailureEvidence,
  quorumFailureEvidenceSchema,
} from "@hall/domain";

export const emptyParticipationEvidence: ParticipationEvidence = {
  rosterMemberIds: [],
  attendance: [],
  quorum: { activeMembers: 0, physicallyPresent: 0, required: 0, reached: false },
};

export function parseParticipationEvidence(value: unknown): ParticipationEvidence {
  return participationEvidenceSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}

export function parseQuorumFailureEvidence(value: unknown): QuorumFailureEvidence | null {
  return value === null
    ? null
    : quorumFailureEvidenceSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}
