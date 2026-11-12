import type { MailMessage, MailRecipient, MailRecipientGroup } from "@hall/api-contract";
import type { MailRecipientSelections } from "../../services/mailApi";

/** The two folders of the mailbox, split on screen from the single list the server returns. */
export type MailFolder = "drafts" | "sent";

export const mailFolders: MailFolder[] = ["drafts", "sent"];

export function isMailFolder(value: string | undefined): value is MailFolder {
  return value === "drafts" || value === "sent";
}

/** A message is sent once it has at least one submission, whatever its outcome. */
export function mailFolderOf(message: MailMessage): MailFolder {
  return message.submissions.length > 0 ? "sent" : "drafts";
}

/** A sent message whose last submission failed or awaits a verification, written in red at the top of « Envoyés ». */
export function needsAttention(message: MailMessage): boolean {
  const latest = message.submissions[0];
  return Boolean(latest && !latest.verification && (latest.status === "failed" || latest.status === "unknown"));
}

function lastActivity(message: MailMessage): string {
  return message.submissions[0]?.startedAt ?? message.updatedAt;
}

/** Messages of one folder: the ones that need attention first, then the most recent first. */
export function folderMessages(messages: MailMessage[], folder: MailFolder): MailMessage[] {
  return messages
    .filter((message) => mailFolderOf(message) === folder)
    .sort(
      (a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || lastActivity(b).localeCompare(lastActivity(a)),
    );
}

/** A named selection of recipients the composer offers: the council, a committee or a saved group. */
export interface RecipientGroup {
  key: string;
  name: string;
  members: Array<Omit<MailRecipient, "kind">>;
  /** Identifier of a saved group, the only kind of group that « Gérer les groupes… » edits. */
  savedGroupId?: string;
}

/** Every selection of recipients available to the composer, in the order of the suggestions. */
export function recipientGroups(
  selections: MailRecipientSelections,
  saved: MailRecipientGroup[],
  councilName: string,
): RecipientGroup[] {
  const contactsOf = (ids: string[]) =>
    selections.contacts.filter((contact) => contact.contactId && ids.includes(contact.contactId));
  return [
    { key: "council", name: councilName, members: contactsOf(selections.councilContactIds) },
    ...selections.committees.map((committee) => ({
      key: `committee:${committee.id}`,
      name: committee.name,
      members: contactsOf(committee.contactIds),
    })),
    ...saved.map((group) => ({
      key: `group:${group.id}`,
      name: group.name,
      members: group.members,
      savedGroupId: group.id,
    })),
  ].filter((group) => group.members.length > 0);
}

/** Identity of a recipient inside one line: its address when it has one, its contact otherwise. */
export function recipientIdentity(recipient: Omit<MailRecipient, "kind">): string {
  return recipient.address ? `address:${recipient.address.toLowerCase()}` : `contact:${recipient.contactId ?? ""}`;
}

/** What one line of recipients shows: groups written as one label, then the other recipients one by one. */
export interface RecipientDisplay {
  groups: Array<{ group: RecipientGroup; indexes: number[] }>;
  singles: number[];
}

/**
 * Reads the recipients of one line as groups and single recipients, without any stored group. A group is recognised
 * when every one of its members is in the line, by address or else by contact; the largest groups are read first and a
 * recipient belongs to one group at most. A line that lacks one member of a group shows its members one by one.
 */
export function displayRecipients(
  recipients: MailRecipient[],
  kind: MailRecipient["kind"],
  groups: RecipientGroup[],
): RecipientDisplay {
  const line = recipients.flatMap((recipient, index) => (recipient.kind === kind ? [index] : []));
  const free = new Map<string, number>();
  for (const index of line) free.set(recipientIdentity(recipients[index]), index);
  const found: RecipientDisplay["groups"] = [];
  for (const group of [...groups].sort((a, b) => b.members.length - a.members.length)) {
    if (group.members.length < 2) continue;
    const identities = [...new Set(group.members.map(recipientIdentity))];
    if (!identities.every((identity) => free.has(identity))) continue;
    found.push({ group, indexes: identities.map((identity) => free.get(identity) as number) });
    for (const identity of identities) free.delete(identity);
  }
  const grouped = new Set(found.flatMap((entry) => entry.indexes));
  return { groups: found, singles: line.filter((index) => !grouped.has(index)) };
}

/** Adds the members of a group, or one recipient, to a line, leaving out the ones already in that line. */
export function addRecipients(
  recipients: MailRecipient[],
  kind: MailRecipient["kind"],
  members: Array<Omit<MailRecipient, "kind">>,
): MailRecipient[] {
  const present = new Set(
    recipients.filter((recipient) => recipient.kind === kind).map((recipient) => recipientIdentity(recipient)),
  );
  const added: MailRecipient[] = [];
  for (const member of members) {
    const identity = recipientIdentity(member);
    if (present.has(identity)) continue;
    present.add(identity);
    added.push({ ...member, kind });
  }
  return [...recipients, ...added];
}
