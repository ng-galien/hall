import type { CouncilMember } from "@hall/domain";
import type {
  ContactRepository,
  CouncilMemberRepository,
  CouncilTermRepository,
  CreateCouncilMember,
  UnitOfWork,
  UpdateCouncilMember,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export interface CouncilMemberService {
  list(): Promise<CouncilMember[]>;
  canCreate(): Promise<boolean>;
  get(id: string): Promise<CouncilMember>;
  create(input: CreateCouncilMember): Promise<CouncilMember>;
  update(id: string, input: UpdateCouncilMember): Promise<CouncilMember>;
}

export function createCouncilMemberService({
  contactRepository,
  councilMemberRepository,
  councilTermRepository,
  unitOfWork,
}: {
  contactRepository: ContactRepository;
  councilMemberRepository: CouncilMemberRepository;
  councilTermRepository: CouncilTermRepository;
  unitOfWork: UnitOfWork;
}): CouncilMemberService {
  const requireMember = async (id: string) => {
    const member = await councilMemberRepository.find(id);
    if (!member) throw new DomainError("council_member_not_found", 404);
    return member;
  };
  const requireContactEligibleForActiveMandate = async (contactId: string, currentMemberId?: string) => {
    const contact = await contactRepository.find(contactId);
    if (!contact) throw new DomainError("contact_not_found", 404);
    if (contact.archivedAt) throw new DomainError("contact_archived", 409);
    const activeMember = await councilMemberRepository.findActiveByContact(contact.id);
    if (activeMember && activeMember.id !== currentMemberId) {
      throw new DomainError("contact_already_active_council_member", 409);
    }
    return contact;
  };
  const councilSeatAvailability = async (): Promise<"available" | "notConfigured" | "full"> => {
    const councilTerm = await councilTermRepository.getActive();
    if (councilTerm.expectedMemberCount === null) return "notConfigured";
    return (await councilMemberRepository.countActive()) < councilTerm.expectedMemberCount ? "available" : "full";
  };
  const requireAvailableCouncilSeat = async () => {
    const availability = await councilSeatAvailability();
    if (availability === "notConfigured") throw new DomainError("council_term_not_configured", 409);
    if (availability === "full") throw new DomainError("council_term_capacity_reached", 409);
  };
  return {
    list: () => councilMemberRepository.list(),
    canCreate: async () => (await councilSeatAvailability()) === "available",
    get: requireMember,
    create(input) {
      return unitOfWork.execute(async () => {
        await requireContactEligibleForActiveMandate(input.contactId);
        await requireAvailableCouncilSeat();
        return councilMemberRepository.create(input);
      });
    },
    update(id, input) {
      return unitOfWork.execute(async () => {
        const member = await requireMember(id);
        if (input.termEndedOn === null) {
          await requireContactEligibleForActiveMandate(member.contact.id, member.id);
          if (!member.active) await requireAvailableCouncilSeat();
        }
        return councilMemberRepository.update(member.id, input);
      });
    },
  };
}
