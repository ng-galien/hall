import type {
  Contact,
  CouncilBusiness,
  CouncilDecisionDetail,
  CouncilDecisionSummary,
  CouncilMeeting,
  CouncilMember,
  ResourceDetail,
} from "@hall/api-contract";
import { matchLiteral, type ReferenceEntityKind } from "@hall/domain";
import type { CouncilClient } from "../clients/councilClient.js";
import type { CouncilDecisionClient } from "../clients/councilDecisionClient.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";

type ReferenceTargetByKind = {
  member: CouncilMember;
  contact: Contact;
  meeting: CouncilMeeting;
  councilBusiness: CouncilBusiness;
  decision: CouncilDecisionDetail;
  resource: ResourceDetail;
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

function contactLabel(contact: Contact): string {
  return `${contact.firstName} ${contact.lastName}`;
}

function meetingLabel(meeting: CouncilMeeting): string {
  return meeting.scheduledAt ? `${meeting.number} - ${meeting.scheduledAt.slice(0, 10)}` : `${meeting.number}`;
}

function decisionLabel(decision: CouncilDecisionSummary): string {
  return decision.number ? `${decision.number} - ${decision.title}` : decision.title;
}

async function councilBusinessLabel(target: CouncilBusiness, resourcesClient: ResourcesClient): Promise<string> {
  const folder = (await resourcesClient.open(target.folderResourceId))?.data ?? null;
  if (folder?.kind !== "folder") {
    throw new Error(`CouncilBusiness ${target.id} has no valid folder resource`);
  }
  return folder.name;
}

export function createReferenceEntityResolver({
  councilClient,
  directoryClient,
  councilDecisionClient,
  resourcesClient,
}: {
  councilClient: CouncilClient;
  directoryClient: DirectoryClient;
  councilDecisionClient: CouncilDecisionClient;
  resourcesClient: ResourcesClient;
}): ReferenceEntityResolver {
  return {
    list(type) {
      return matchLiteral(type, {
        member: async () =>
          Promise.all([directoryClient.listCouncilMembers(), directoryClient.listContacts(true)]).then(
            ([members, contacts]) => {
              const contactsById = new Map(contacts.map((contact) => [contact.id, contact] as const));
              return members.flatMap((target) => {
                const contact = contactsById.get(target.contactId);
                return contact ? [{ type: "member" as const, id: target.id, label: contactLabel(contact) }] : [];
              });
            },
          ),
        contact: async () =>
          (await directoryClient.listContacts()).map((target) => ({
            type: "contact" as const,
            id: target.id,
            label: contactLabel(target),
          })),
        meeting: async () =>
          (await councilClient.listMeetings()).map((target) => ({
            type: "meeting" as const,
            id: target.id,
            label: meetingLabel(target),
          })),
        councilBusiness: async () => {
          const targets = await councilClient.listBusinesses();
          return Promise.all(
            targets.map(async (target) => ({
              type: "councilBusiness" as const,
              id: target.id,
              label: await councilBusinessLabel(target, resourcesClient),
            })),
          );
        },
        decision: async () =>
          (await councilDecisionClient.list()).map((target) => ({
            type: "decision" as const,
            id: target.id,
            label: decisionLabel(target),
          })),
        resource: async () =>
          (await resourcesClient.listAll()).data.map((target) => ({
            type: "resource" as const,
            id: target.id,
            label: target.name,
          })),
      });
    },
    async resolve(type, id) {
      return matchLiteral(type, {
        member: async () => {
          const target = await directoryClient.openCouncilMember(id);
          if (!target) return null;
          const contact = await directoryClient.openContact(target.contactId);
          return contact ? { type: "member" as const, id: target.id, label: contactLabel(contact), target } : null;
        },
        contact: async () => {
          const target = await directoryClient.openContact(id);
          return target ? { type: "contact" as const, id: target.id, label: contactLabel(target), target } : null;
        },
        meeting: async () => {
          const target = await councilClient.openMeeting(id);
          return target ? { type: "meeting" as const, id: target.id, label: meetingLabel(target), target } : null;
        },
        councilBusiness: async () => {
          const target = await councilClient.openBusiness(id);
          return target
            ? {
                type: "councilBusiness" as const,
                id: target.id,
                label: await councilBusinessLabel(target, resourcesClient),
                target,
              }
            : null;
        },
        decision: async () => {
          const target = await councilDecisionClient.open(id);
          return target ? { type: "decision" as const, id: target.id, label: decisionLabel(target), target } : null;
        },
        resource: async () => {
          const target = (await resourcesClient.open(id))?.data ?? null;
          return target ? { type: "resource" as const, id: target.id, label: target.name, target } : null;
        },
      });
    },
  };
}
