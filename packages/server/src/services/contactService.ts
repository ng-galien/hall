import type { Contact } from "@hall/domain";
import type { ContactRepository, CouncilMemberRepository, SaveContact, UnitOfWork } from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export interface ContactService {
  list(includeArchived?: boolean): Promise<Contact[]>;
  get(id: string): Promise<Contact>;
  create(input: SaveContact): Promise<Contact>;
  update(id: string, input: SaveContact): Promise<Contact>;
  archive(id: string): Promise<Contact>;
}

export function createContactService({
  contactRepository,
  councilMemberRepository,
  unitOfWork,
}: {
  contactRepository: ContactRepository;
  councilMemberRepository: CouncilMemberRepository;
  unitOfWork: UnitOfWork;
}): ContactService {
  const requireContact = async (id: string) => {
    const contact = await contactRepository.find(id);
    if (!contact) throw new DomainError("contact_not_found", 404);
    return contact;
  };
  return {
    list: (includeArchived = false) => contactRepository.list({ includeArchived }),
    get: requireContact,
    create: (input) => unitOfWork.execute(() => contactRepository.create(input)),
    update(id, input) {
      return unitOfWork.execute(async () => {
        const contact = await requireContact(id);
        if (contact.archivedAt) throw new DomainError("conflict", 409);
        return contactRepository.update(contact.id, input);
      });
    },
    archive(id) {
      return unitOfWork.execute(async () => {
        const contact = await requireContact(id);
        if (contact.archivedAt) return contact;
        if (await councilMemberRepository.findActiveByContact(contact.id)) {
          throw new DomainError("contact_has_active_council_membership", 409);
        }
        return contactRepository.archive(contact.id, new Date().toISOString());
      });
    },
  };
}
