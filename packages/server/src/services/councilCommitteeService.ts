import type { CommitteeMembership, CouncilCommittee } from "@hall/domain";
import type {
  AddCommitteeMembership,
  CommitteeMembershipRepository,
  CouncilCommitteeRepository,
  CouncilMemberRepository,
  CreateCouncilCommittee,
  UnitOfWork,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export interface CouncilCommitteeDetails {
  committee: CouncilCommittee;
  memberships: CommitteeMembership[];
}

export interface CouncilCommitteeService {
  list(includeArchived?: boolean): Promise<CouncilCommittee[]>;
  get(reference: string): Promise<CouncilCommitteeDetails>;
  create(input: CreateCouncilCommittee): Promise<CouncilCommittee>;
  update(reference: string, input: CreateCouncilCommittee): Promise<CouncilCommittee>;
  archive(reference: string): Promise<CouncilCommittee>;
  addMembership(reference: string, input: AddCommitteeMembership): Promise<CommitteeMembership>;
  endMembership(reference: string, membershipId: string, endedOn: string): Promise<CommitteeMembership>;
}

export function createCouncilCommitteeService({
  councilCommitteeRepository,
  committeeMembershipRepository,
  councilMemberRepository,
  unitOfWork,
}: {
  councilCommitteeRepository: CouncilCommitteeRepository;
  committeeMembershipRepository: CommitteeMembershipRepository;
  councilMemberRepository: CouncilMemberRepository;
  unitOfWork: UnitOfWork;
}): CouncilCommitteeService {
  const requireCommittee = async (reference: string) => {
    const committee = await councilCommitteeRepository.find(reference);
    if (!committee) throw new DomainError("council_committee_not_found", 404);
    return committee;
  };
  return {
    list: (includeArchived = false) => councilCommitteeRepository.list({ includeArchived }),
    async get(reference) {
      const committee = await requireCommittee(reference);
      return {
        committee,
        memberships: await committeeMembershipRepository.listForCommittee(committee.id),
      };
    },
    create: (input) => unitOfWork.execute(() => councilCommitteeRepository.create(input)),
    update(reference, input) {
      return unitOfWork.execute(async () => {
        const committee = await requireCommittee(reference);
        if (committee.archivedAt) throw new DomainError("conflict", 409);
        return councilCommitteeRepository.update(committee.id, input);
      });
    },
    archive(reference) {
      return unitOfWork.execute(async () => {
        const committee = await requireCommittee(reference);
        if (committee.archivedAt) return committee;
        return councilCommitteeRepository.archive(committee.id, new Date().toISOString());
      });
    },
    addMembership(reference, input) {
      return unitOfWork.execute(async () => {
        const committee = await requireCommittee(reference);
        if (committee.archivedAt) throw new DomainError("conflict", 409);
        if (!(await councilMemberRepository.find(input.councilMemberId))) {
          throw new DomainError("council_member_not_found", 404);
        }
        const memberships = await committeeMembershipRepository.listForCommittee(committee.id);
        if (
          memberships.some((membership) => membership.councilMemberId === input.councilMemberId && !membership.endedOn)
        ) {
          throw new DomainError("conflict", 409);
        }
        return committeeMembershipRepository.add(committee.id, input);
      });
    },
    endMembership(reference, membershipId, endedOn) {
      return unitOfWork.execute(async () => {
        const committee = await requireCommittee(reference);
        const membership = (await committeeMembershipRepository.listForCommittee(committee.id)).find(
          (candidate) => candidate.id === membershipId,
        );
        if (!membership) throw new DomainError("committee_membership_not_found", 404);
        if (membership.endedOn) return membership;
        if (endedOn < membership.startedOn) throw new DomainError("invalid_request");
        return committeeMembershipRepository.end(membership.id, endedOn);
      });
    },
  };
}
