import {
  type CouncilBusiness,
  type CouncilDecision,
  type CouncilMeeting,
  type CouncilMember,
  matchLiteral,
  type ReferenceEntityKind,
} from "@hall/domain";
import type {
  CouncilBusinessRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CouncilMemberRepository,
  ResourceRepository,
  StoredResource,
} from "../repositories/contracts.js";

type ReferenceTargetByKind = {
  member: CouncilMember;
  meeting: CouncilMeeting;
  councilBusiness: CouncilBusiness;
  decision: CouncilDecision;
  resource: StoredResource;
};

export type ResolvedReference = {
  [K in ReferenceEntityKind]: {
    type: K;
    id: string;
    label: string;
    target: ReferenceTargetByKind[K];
  };
}[ReferenceEntityKind];

export interface ReferenceCandidate {
  type: ReferenceEntityKind;
  id: string;
  label: string;
}

export interface ReferenceEntityResolver {
  list(type: ReferenceEntityKind): Promise<ReferenceCandidate[]>;
  resolve(type: ReferenceEntityKind, id: string): Promise<ResolvedReference | null>;
}

function memberLabel(member: CouncilMember): string {
  return `${member.firstName} ${member.lastName}`;
}

function meetingLabel(meeting: CouncilMeeting): string {
  return `${meeting.number} - ${meeting.startsAt.slice(0, 10)}`;
}

function decisionLabel(decision: CouncilDecision): string {
  return decision.number ? `${decision.number} - ${decision.title}` : decision.title;
}

export function createReferenceEntityResolver({
  councilMemberRepository,
  councilMeetingRepository,
  councilDecisionRepository,
  councilBusinessRepository,
  resourceRepository,
}: {
  councilMemberRepository: CouncilMemberRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  councilBusinessRepository: CouncilBusinessRepository;
  resourceRepository: ResourceRepository;
}): ReferenceEntityResolver {
  return {
    list(type) {
      return matchLiteral(type, {
        member: async () =>
          (await councilMemberRepository.list()).map((target) => ({
            type: "member" as const,
            id: target.id,
            label: memberLabel(target),
          })),
        meeting: async () =>
          (await councilMeetingRepository.list()).map((target) => ({
            type: "meeting" as const,
            id: target.id,
            label: meetingLabel(target),
          })),
        councilBusiness: async () =>
          (await councilBusinessRepository.list()).map((target) => ({
            type: "councilBusiness" as const,
            id: target.id,
            label: target.title,
          })),
        decision: async () =>
          (await councilDecisionRepository.list()).map((target) => ({
            type: "decision" as const,
            id: target.id,
            label: decisionLabel(target),
          })),
        resource: async () =>
          (await resourceRepository.list()).map((target) => ({
            type: "resource" as const,
            id: target.id,
            label: target.title,
          })),
      });
    },
    async resolve(type, id) {
      return matchLiteral(type, {
        member: async () => {
          const target = await councilMemberRepository.find(id);
          return target ? { type: "member" as const, id: target.id, label: memberLabel(target), target } : null;
        },
        meeting: async () => {
          const target = await councilMeetingRepository.find(id);
          return target ? { type: "meeting" as const, id: target.id, label: meetingLabel(target), target } : null;
        },
        councilBusiness: async () => {
          const target = await councilBusinessRepository.find(id);
          return target ? { type: "councilBusiness" as const, id: target.id, label: target.title, target } : null;
        },
        decision: async () => {
          const target = await councilDecisionRepository.find(id);
          return target ? { type: "decision" as const, id: target.id, label: decisionLabel(target), target } : null;
        },
        resource: async () => {
          const target = await resourceRepository.find(id);
          return target ? { type: "resource" as const, id: target.id, label: target.title, target } : null;
        },
      });
    },
  };
}
