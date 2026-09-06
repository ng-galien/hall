import type { Contact, CouncilMember as CouncilMemberRecord } from "@hall/api-contract";

export type ContactSummary = Pick<
  Contact,
  "id" | "firstName" | "lastName" | "organizationName" | "jobTitle" | "email" | "phone" | "archivedAt"
>;

/** Client projection assembled from the independent Contact and CouncilMember resources. */
export type CouncilMemberView = CouncilMemberRecord & Readonly<{ contact: ContactSummary }>;

export function councilMemberView(member: CouncilMemberRecord, contact: Contact): CouncilMemberView {
  return {
    ...member,
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      organizationName: contact.organizationName,
      jobTitle: contact.jobTitle,
      email: contact.email,
      phone: contact.phone,
      archivedAt: contact.archivedAt,
    },
  };
}
